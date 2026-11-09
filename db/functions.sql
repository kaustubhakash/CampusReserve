-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Stored Function: fn_is_resource_available
-- Database: campus_reserve
-- File: db/functions.sql
-- ============================================================================

USE campus_reserve;

DROP FUNCTION IF EXISTS fn_is_resource_available;

DELIMITER $$

-- ============================================================================
-- FUNCTION: fn_is_resource_available
-- 
-- Purpose:
--   Returns TRUE (1) if a given campus resource has no overlapping CONFIRMED
--   reservation for the requested time interval; otherwise returns FALSE (0).
--
-- Overlap Formula:
--   existing.start_at < requested_end AND existing.end_at > requested_start
--
-- Non-overlapping Boundaries:
--   Back-to-back reservations (e.g. 09:00-10:00 and 10:00-11:00) do NOT overlap
--   because 09:00 < 10:00 is TRUE but 10:00 > 10:00 is FALSE.
--
-- Operational Caveat:
--   This function is a read-only availability check suitable for queries,
--   filters, and availability views. It is NOT a substitute for transactional
--   row locking (`SELECT ... FOR UPDATE`) during actual booking execution,
--   which is required to prevent race conditions during concurrent bookings.
-- ============================================================================
CREATE FUNCTION fn_is_resource_available(
  p_resource_id BIGINT UNSIGNED,
  p_start_at DATETIME,
  p_end_at DATETIME
)
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_conflict_count INT DEFAULT 0;
  DECLARE v_is_active BOOLEAN DEFAULT FALSE;

  -- 1. Validate interval: end_at must strictly be greater than start_at
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RETURN FALSE;
  END IF;

  -- 2. Verify that the resource exists and is active
  SELECT is_active INTO v_is_active
  FROM resources
  WHERE id = p_resource_id;

  IF v_is_active IS NULL OR v_is_active = FALSE THEN
    RETURN FALSE;
  END IF;

  -- 3. Check for any overlapping CONFIRMED reservation
  -- Cancelled reservations (status = 'CANCELLED') are explicitly ignored
  SELECT COUNT(*) INTO v_conflict_count
  FROM reservations
  WHERE resource_id = p_resource_id
    AND status = 'CONFIRMED'
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF v_conflict_count = 0 THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END$$

DELIMITER ;
