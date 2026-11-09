-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Stored Procedures: Reservation Request & Automated Waitlist Processing
-- Database: campus_reserve
-- File: db/procedures.sql
-- ============================================================================

USE campus_reserve;

DROP PROCEDURE IF EXISTS sp_request_reservation;
DROP PROCEDURE IF EXISTS sp_cancel_and_process_waitlist;

DELIMITER $$

-- ============================================================================
-- 1. PROCEDURE: sp_request_reservation
--
-- Purpose:
--   Atomically validates and requests a resource reservation.
--   If available, creates a CONFIRMED reservation.
--   If conflict detected, places user on WAITING waitlist.
-- ============================================================================
CREATE PROCEDURE sp_request_reservation(
  IN p_user_id BIGINT UNSIGNED,
  IN p_resource_id BIGINT UNSIGNED,
  IN p_start_at DATETIME,
  IN p_end_at DATETIME,
  IN p_purpose VARCHAR(255),
  IN p_priority_level INT UNSIGNED,
  OUT p_outcome ENUM('CONFIRMED', 'WAITLISTED', 'REJECTED'),
  OUT p_booking_id BIGINT UNSIGNED,
  OUT p_waitlist_id BIGINT UNSIGNED,
  OUT p_message VARCHAR(255)
)
proc_block: BEGIN
  DECLARE v_user_exists INT DEFAULT 0;
  DECLARE v_user_active BOOLEAN DEFAULT FALSE;
  DECLARE v_res_exists INT DEFAULT 0;
  DECLARE v_res_active BOOLEAN DEFAULT FALSE;
  DECLARE v_conflict_count INT DEFAULT 0;
  DECLARE v_effective_priority INT UNSIGNED DEFAULT 5;
  DECLARE v_new_res_id BIGINT UNSIGNED;
  DECLARE v_new_wl_id BIGINT UNSIGNED;

  -- Handlers must come immediately after DECLARE variables
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_outcome = 'REJECTED';
    SET p_booking_id = NULL;
    SET p_waitlist_id = NULL;
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
  END;

  -- Initialize OUT parameters
  SET p_outcome = 'REJECTED';
  SET p_booking_id = NULL;
  SET p_waitlist_id = NULL;
  SET p_message = '';

  -- 1. Validate requested interval
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    SET p_outcome = 'REJECTED';
    SET p_message = 'Invalid interval: end_at must be strictly greater than start_at.';
    LEAVE proc_block;
  END IF;

  -- 2. Validate requesting user existence and active status
  SELECT COUNT(*), COALESCE(MAX(is_active), FALSE)
  INTO v_user_exists, v_user_active
  FROM users
  WHERE id = p_user_id;

  IF v_user_exists = 0 OR v_user_active = FALSE THEN
    SET p_outcome = 'REJECTED';
    SET p_message = 'Requesting user does not exist or account is inactive.';
    LEAVE proc_block;
  END IF;

  -- 3. Determine effective priority level (default = 5, bounded 1-10)
  IF p_priority_level IS NOT NULL AND p_priority_level >= 1 AND p_priority_level <= 10 THEN
    SET v_effective_priority = p_priority_level;
  ELSE
    SET v_effective_priority = 5;
  END IF;

  -- 4. Begin transactional booking validation with row-level serialization
  START TRANSACTION;

  -- Lock the target resource row to prevent concurrent interval insertion races
  SELECT COUNT(*), COALESCE(MAX(is_active), FALSE)
  INTO v_res_exists, v_res_active
  FROM resources
  WHERE id = p_resource_id
  FOR UPDATE;

  IF v_res_exists = 0 OR v_res_active = FALSE THEN
    ROLLBACK;
    SET p_outcome = 'REJECTED';
    SET p_message = 'Target resource does not exist or is inactive.';
    LEAVE proc_block;
  END IF;

  -- 5. Check for overlapping CONFIRMED reservations
  -- Overlap condition: existing.start_at < requested.end_at AND existing.end_at > requested.start_at
  SELECT COUNT(*) INTO v_conflict_count
  FROM reservations
  WHERE resource_id = p_resource_id
    AND status = 'CONFIRMED'
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count = 0 THEN
    -- Resource is available: create CONFIRMED reservation
    INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
    VALUES (p_user_id, p_resource_id, p_start_at, p_end_at, p_purpose, 'CONFIRMED');

    SET v_new_res_id = LAST_INSERT_ID();
    COMMIT;

    SET p_outcome = 'CONFIRMED';
    SET p_booking_id = v_new_res_id;
    SET p_waitlist_id = NULL;
    SET p_message = 'Reservation confirmed successfully.';
  ELSE
    -- Conflict detected: place user on the WAITING waitlist
    INSERT INTO waitlist_entries (user_id, resource_id, requested_start_at, requested_end_at, priority_level, status)
    VALUES (p_user_id, p_resource_id, p_start_at, p_end_at, v_effective_priority, 'WAITING');

    SET v_new_wl_id = LAST_INSERT_ID();
    COMMIT;

    SET p_outcome = 'WAITLISTED';
    SET p_booking_id = NULL;
    SET p_waitlist_id = v_new_wl_id;
    SET p_message = CONCAT('Resource is currently booked for that time window. Placed on waitlist with priority level ', v_effective_priority, '.');
  END IF;
END$$


-- ============================================================================
-- 2. PROCEDURE: sp_cancel_and_process_waitlist
--
-- Purpose:
--   Cancels a reservation and immediately processes the waitlist for that resource.
--   Eligible waitlisted candidates are evaluated in priority order:
--     ORDER BY priority_level ASC, joined_at ASC
--
-- Authorization & Security Architecture:
--   The requester's role (STUDENT or ADMIN) and active status are verified directly
--   from the `users` table using `p_requester_user_id`. The client-caller cannot
--   bypass authorization by passing a fake role string.
--   A student can only cancel their own reservation.
--   An administrator can cancel any reservation.
-- ============================================================================
CREATE PROCEDURE sp_cancel_and_process_waitlist(
  IN p_reservation_id BIGINT UNSIGNED,
  IN p_requester_user_id BIGINT UNSIGNED,
  OUT p_cancellation_status ENUM('CANCELLED', 'REJECTED'),
  OUT p_promoted_reservation_id BIGINT UNSIGNED,
  OUT p_promoted_user_id BIGINT UNSIGNED,
  OUT p_promoted_waitlist_id BIGINT UNSIGNED,
  OUT p_message VARCHAR(255)
)
cancel_block: BEGIN
  DECLARE v_res_user_id BIGINT UNSIGNED;
  DECLARE v_resource_id BIGINT UNSIGNED;
  DECLARE v_current_status ENUM('CONFIRMED', 'CANCELLED');
  DECLARE v_requester_role ENUM('STUDENT', 'ADMIN');
  DECLARE v_requester_active BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  
  -- Cursor variables
  DECLARE cur_wl_id BIGINT UNSIGNED;
  DECLARE cur_wl_user_id BIGINT UNSIGNED;
  DECLARE cur_wl_start DATETIME;
  DECLARE cur_wl_end DATETIME;
  DECLARE cur_wl_priority INT UNSIGNED;
  DECLARE v_wl_conflict_count INT DEFAULT 0;
  DECLARE v_found_eligible_wl BOOLEAN DEFAULT FALSE;

  -- Cursor definition must follow variable declarations
  DECLARE waitlist_cur CURSOR FOR
    SELECT id, user_id, requested_start_at, requested_end_at, priority_level
    FROM waitlist_entries
    WHERE resource_id = v_resource_id
      AND status = 'WAITING'
    ORDER BY priority_level ASC, joined_at ASC;

  -- Handlers must come after cursors
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_cancellation_status = 'REJECTED';
    SET p_promoted_reservation_id = NULL;
    SET p_promoted_user_id = NULL;
    SET p_promoted_waitlist_id = NULL;
    GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
  END;

  -- Initialize OUT parameters
  SET p_cancellation_status = 'REJECTED';
  SET p_promoted_reservation_id = NULL;
  SET p_promoted_user_id = NULL;
  SET p_promoted_waitlist_id = NULL;
  SET p_message = '';

  -- 1. Validate requester identity against the database (never trust client-supplied roles)
  SELECT role, is_active
  INTO v_requester_role, v_requester_active
  FROM users
  WHERE id = p_requester_user_id;

  IF v_requester_role IS NULL OR v_requester_active = FALSE THEN
    SET p_cancellation_status = 'REJECTED';
    SET p_message = 'Requester does not exist or user account is inactive.';
    LEAVE cancel_block;
  END IF;

  -- 2. Begin atomic transaction
  START TRANSACTION;

  -- 3. Verify reservation existence and lock the row
  SELECT user_id, resource_id, status
  INTO v_res_user_id, v_resource_id, v_current_status
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    ROLLBACK;
    SET p_cancellation_status = 'REJECTED';
    SET p_message = 'Reservation not found.';
    LEAVE cancel_block;
  END IF;

  IF v_current_status = 'CANCELLED' THEN
    ROLLBACK;
    SET p_cancellation_status = 'REJECTED';
    SET p_message = 'Reservation is already cancelled.';
    LEAVE cancel_block;
  END IF;

  -- 4. Authorization check: Requester must be the owner OR an administrator in the database
  IF v_requester_role <> 'ADMIN' AND p_requester_user_id <> v_res_user_id THEN
    ROLLBACK;
    SET p_cancellation_status = 'REJECTED';
    SET p_message = 'Unauthorized: Students can only cancel their own reservations.';
    LEAVE cancel_block;
  END IF;

  -- 5. Set session actor variables for the AFTER UPDATE trigger audit log
  SET @app_current_user_id = p_requester_user_id;
  SET @app_change_source = CASE WHEN v_requester_role = 'ADMIN' THEN 'ADMIN_ACTION' ELSE 'USER_ACTION' END;

  -- 6. Lock the resource row to serialize waitlist promotion against concurrent bookings
  SELECT id INTO @dummy_lock FROM resources WHERE id = v_resource_id FOR UPDATE;

  -- 7. Update reservation status to CANCELLED
  -- Triggers will authoritatively log this in reservation_status_history using session actor
  UPDATE reservations
  SET status = 'CANCELLED',
      cancelled_at = NOW()
  WHERE id = p_reservation_id;

  -- 8. Evaluate waitlist candidates for auto-promotion
  OPEN waitlist_cur;

  read_loop: LOOP
    FETCH waitlist_cur INTO cur_wl_id, cur_wl_user_id, cur_wl_start, cur_wl_end, cur_wl_priority;
    IF v_done THEN
      LEAVE read_loop;
    END IF;

    -- Check if this candidate's requested window is now completely free of other CONFIRMED bookings
    SELECT COUNT(*) INTO v_wl_conflict_count
    FROM reservations
    WHERE resource_id = v_resource_id
      AND status = 'CONFIRMED'
      AND start_at < cur_wl_end
      AND end_at > cur_wl_start;

    IF v_wl_conflict_count = 0 THEN
      -- Candidate's window is completely clear: PROMOTE!
      -- Set session actor as SYSTEM_AUTO_PROMOTION for the new booking
      SET @app_current_user_id = cur_wl_user_id;
      SET @app_change_source = 'SYSTEM_AUTO_PROMOTION';

      -- Step A: Create new CONFIRMED reservation
      INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
      VALUES (
        cur_wl_user_id,
        v_resource_id,
        cur_wl_start,
        cur_wl_end,
        CONCAT('Auto-promoted from Waitlist Entry #', cur_wl_id),
        'CONFIRMED'
      );

      SET p_promoted_reservation_id = LAST_INSERT_ID();
      SET p_promoted_user_id = cur_wl_user_id;
      SET p_promoted_waitlist_id = cur_wl_id;
      SET v_found_eligible_wl = TRUE;

      -- Step B: Update waitlist entry to PROMOTED
      UPDATE waitlist_entries
      SET status = 'PROMOTED',
          promoted_at = NOW(),
          promoted_reservation_id = p_promoted_reservation_id
      WHERE id = cur_wl_id;

      -- First eligible candidate promoted; stop further promotions for this cancellation event
      LEAVE read_loop;
    END IF;
  END LOOP;

  CLOSE waitlist_cur;

  -- Reset session variables
  SET @app_current_user_id = NULL;
  SET @app_change_source = NULL;

  -- Commit the cancellation and any promotion
  COMMIT;

  SET p_cancellation_status = 'CANCELLED';
  IF v_found_eligible_wl THEN
    SET p_message = CONCAT('Reservation #', p_reservation_id, ' successfully cancelled. Waitlisted candidate #', p_promoted_waitlist_id, ' auto-promoted to Reservation #', p_promoted_reservation_id, '.');
  ELSE
    SET p_message = CONCAT('Reservation #', p_reservation_id, ' successfully cancelled. No eligible waitlist candidate found for promotion.');
  END IF;

END$$

DELIMITER ;
