-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Database Triggers for Integrity Enforcement & Audit Logging (MySQL 8)
-- Database: campus_reserve
-- File: db/triggers.sql
-- ============================================================================

USE campus_reserve;

DROP TRIGGER IF EXISTS trg_reservations_before_insert;
DROP TRIGGER IF EXISTS trg_reservations_before_update;
DROP TRIGGER IF EXISTS trg_reservations_after_insert;
DROP TRIGGER IF EXISTS trg_reservations_after_update;

DELIMITER $$

-- ============================================================================
-- 1. TRIGGER: trg_reservations_before_insert
--
-- Purpose:
--   Enforces database-side interval validation, active status checks, and
--   prevents overlapping CONFIRMED reservations at the engine level even if
--   direct SQL INSERTs bypass stored procedures.
-- ============================================================================
CREATE TRIGGER trg_reservations_before_insert
BEFORE INSERT ON reservations
FOR EACH ROW
BEGIN
  DECLARE v_conflict_count INT DEFAULT 0;
  DECLARE v_is_active BOOLEAN DEFAULT FALSE;

  -- 1. Check interval order
  IF NEW.end_at <= NEW.start_at THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Trigger validation error: end_at must be strictly greater than start_at.';
  END IF;

  -- 2. Verify resource is active
  SELECT is_active INTO v_is_active
  FROM resources
  WHERE id = NEW.resource_id;

  IF v_is_active IS NULL OR v_is_active = FALSE THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Trigger validation error: Resource does not exist or is inactive.';
  END IF;

  -- 3. If inserting a CONFIRMED reservation, prevent overlapping CONFIRMED intervals
  IF NEW.status = 'CONFIRMED' THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM reservations
    WHERE resource_id = NEW.resource_id
      AND status = 'CONFIRMED'
      AND start_at < NEW.end_at
      AND end_at > NEW.start_at;

    IF v_conflict_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Trigger validation error: Overlapping confirmed reservation exists for this resource and time interval.';
    END IF;
  END IF;
END$$

-- ============================================================================
-- 2. TRIGGER: trg_reservations_before_update
--
-- Purpose:
--   Prevents invalid intervals and conflicting CONFIRMED bookings on updates,
--   excluding the row currently being modified (`id != NEW.id`).
-- ============================================================================
CREATE TRIGGER trg_reservations_before_update
BEFORE UPDATE ON reservations
FOR EACH ROW
BEGIN
  DECLARE v_conflict_count INT DEFAULT 0;
  DECLARE v_is_active BOOLEAN DEFAULT FALSE;

  -- 1. Check interval order
  IF NEW.end_at <= NEW.start_at THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Trigger validation error: end_at must be strictly greater than start_at.';
  END IF;

  -- 2. Verify resource is active
  SELECT is_active INTO v_is_active
  FROM resources
  WHERE id = NEW.resource_id;

  IF v_is_active IS NULL OR v_is_active = FALSE THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Trigger validation error: Resource does not exist or is inactive.';
  END IF;

  -- 3. If updating to or keeping CONFIRMED status, check for overlapping bookings excluding self
  IF NEW.status = 'CONFIRMED' THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM reservations
    WHERE resource_id = NEW.resource_id
      AND id <> NEW.id
      AND status = 'CONFIRMED'
      AND start_at < NEW.end_at
      AND end_at > NEW.start_at;

    IF v_conflict_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Trigger validation error: Overlapping confirmed reservation exists for this resource and time interval.';
    END IF;
  END IF;

  -- 4. Maintain cancelled_at timestamp consistency
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    IF NEW.cancelled_at IS NULL THEN
      SET NEW.cancelled_at = NOW();
    END IF;
  END IF;
END$$

-- ============================================================================
-- 3. TRIGGER: trg_reservations_after_insert
--
-- Purpose:
--   Authoritatively records the initial creation event of a reservation in
--   `reservation_status_history` with old_status = 'NONE'.
--   Picks up session context `@app_current_user_id` and `@app_change_source`
--   if set by application procedures, otherwise defaults to NEW.user_id / 'USER_ACTION'.
-- ============================================================================
CREATE TRIGGER trg_reservations_after_insert
AFTER INSERT ON reservations
FOR EACH ROW
BEGIN
  INSERT INTO reservation_status_history (
    reservation_id,
    old_status,
    new_status,
    changed_by,
    change_source,
    reason,
    changed_at
  ) VALUES (
    NEW.id,
    'NONE',
    NEW.status,
    COALESCE(@app_current_user_id, NEW.user_id),
    COALESCE(@app_change_source, 'USER_ACTION'),
    'Initial reservation record created',
    NEW.created_at
  );
END$$

-- ============================================================================
-- 4. TRIGGER: trg_reservations_after_update
--
-- Purpose:
--   Authoritatively logs status transitions (e.g. CONFIRMED -> CANCELLED)
--   in `reservation_status_history`.
--   Picks up session context `@app_current_user_id` and `@app_change_source`
--   (e.g. distinguishing ADMIN_ACTION from USER_ACTION or SYSTEM_AUTO_PROMOTION).
-- ============================================================================
CREATE TRIGGER trg_reservations_after_update
AFTER UPDATE ON reservations
FOR EACH ROW
BEGIN
  -- Only record history if status actually changed
  IF OLD.status <> NEW.status THEN
    INSERT INTO reservation_status_history (
      reservation_id,
      old_status,
      new_status,
      changed_by,
      change_source,
      reason,
      changed_at
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(@app_current_user_id, NEW.user_id),
      COALESCE(
        @app_change_source,
        CASE 
          WHEN NEW.status = 'CANCELLED' THEN 'USER_ACTION'
          ELSE 'SYSTEM_AUTO_PROMOTION'
        END
      ),
      CONCAT('Reservation status transitioned from ', OLD.status, ' to ', NEW.status),
      COALESCE(NEW.cancelled_at, NOW())
    );
  END IF;
END$$

DELIMITER ;
