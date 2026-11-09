-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Relational Database Views for Dashboards & Analytics (MySQL 8)
-- Database: campus_reserve
-- File: db/views.sql
-- ============================================================================

USE campus_reserve;

DROP VIEW IF EXISTS vw_resource_availability;
DROP VIEW IF EXISTS vw_resource_utilization;
DROP VIEW IF EXISTS vw_booking_history;
DROP VIEW IF EXISTS vw_cancellation_summary;
DROP VIEW IF EXISTS vw_peak_booking_hours;

-- ============================================================================
-- 1. VIEW: vw_resource_availability
--
-- Purpose & Dashboard Usage:
--   Reports high-level availability metrics per campus resource, including total
--   active bookings, current active waitlist queue depth, and immediate next
--   upcoming booking window.
--
-- Note on Interval Checking:
--   This view provides aggregate catalog availability and queue depth.
--   Checking arbitrary user-requested time intervals is handled via
--   `fn_is_resource_available(resource_id, start_at, end_at)` or direct parameterized
--   range queries, because SQL views in MySQL cannot accept dynamic function arguments.
-- ============================================================================
CREATE VIEW vw_resource_availability AS
SELECT 
  r.id AS resource_id,
  r.name AS resource_name,
  r.resource_type,
  r.building,
  r.floor,
  r.room_number,
  r.capacity,
  r.is_active,
  COUNT(DISTINCT CASE WHEN res.status = 'CONFIRMED' AND res.end_at >= NOW() THEN res.id END) AS upcoming_confirmed_bookings,
  COUNT(DISTINCT CASE WHEN wl.status = 'WAITING' THEN wl.id END) AS active_waitlist_count,
  MIN(CASE WHEN res.status = 'CONFIRMED' AND res.start_at >= NOW() THEN res.start_at END) AS next_scheduled_booking_start
FROM resources r
LEFT JOIN reservations res ON r.id = res.resource_id
LEFT JOIN waitlist_entries wl ON r.id = wl.resource_id
GROUP BY 
  r.id, r.name, r.resource_type, r.building, r.floor, r.room_number, r.capacity, r.is_active;

-- ============================================================================
-- 2. VIEW: vw_resource_utilization
--
-- Purpose & Dashboard Usage:
--   Aggregates total confirmed hours booked, booking counts, and average duration
--   per resource. Used by administrator reporting dashboards to identify
--   over-utilized and under-utilized campus facilities.
--   Cancelled reservations are strictly excluded from utilized hours.
-- ============================================================================
CREATE VIEW vw_resource_utilization AS
SELECT 
  r.id AS resource_id,
  r.name AS resource_name,
  r.resource_type,
  r.capacity,
  COUNT(CASE WHEN res.status = 'CONFIRMED' THEN res.id END) AS total_confirmed_bookings,
  COALESCE(SUM(CASE WHEN res.status = 'CONFIRMED' THEN TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) END), 0) AS total_utilized_minutes,
  ROUND(COALESCE(SUM(CASE WHEN res.status = 'CONFIRMED' THEN TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) END), 0) / 60.0, 2) AS total_utilized_hours,
  ROUND(AVG(CASE WHEN res.status = 'CONFIRMED' THEN TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) END), 1) AS avg_booking_duration_minutes
FROM resources r
LEFT JOIN reservations res ON r.id = res.resource_id
GROUP BY r.id, r.name, r.resource_type, r.capacity;

-- ============================================================================
-- 3. VIEW: vw_booking_history
--
-- Purpose & Dashboard Usage:
--   Comprehensive relational view linking reservations with user and venue
--   details, durations, cancellation timestamps, and current lifecycle state.
--   Powers the student "My Bookings" page and administrator audit view.
-- ============================================================================
CREATE VIEW vw_booking_history AS
SELECT 
  res.id AS reservation_id,
  res.user_id,
  u.full_name AS user_name,
  u.email AS user_email,
  u.role AS user_role,
  res.resource_id,
  r.name AS resource_name,
  r.resource_type,
  CONCAT(r.building, ' - Rm ', r.room_number) AS venue_location,
  res.start_at,
  res.end_at,
  TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) AS duration_minutes,
  res.purpose,
  res.status,
  res.created_at AS booked_at,
  res.cancelled_at
FROM reservations res
JOIN users u ON res.user_id = u.id
JOIN resources r ON res.resource_id = r.id;

-- ============================================================================
-- 4. VIEW: vw_cancellation_summary
--
-- Purpose & Dashboard Usage:
--   Analyzes cancellation rates across resources. Displays total bookings,
--   confirmed counts, cancellation counts, and calculates cancellation percentage.
--   Used by administrators to monitor schedule volatility and resource hoarding.
-- ============================================================================
CREATE VIEW vw_cancellation_summary AS
SELECT 
  r.id AS resource_id,
  r.name AS resource_name,
  r.resource_type,
  COUNT(res.id) AS total_reservations_placed,
  SUM(CASE WHEN res.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_count,
  SUM(CASE WHEN res.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
  ROUND(
    (SUM(CASE WHEN res.status = 'CANCELLED' THEN 1 ELSE 0 END) * 100.0) / 
    NULLIF(COUNT(res.id), 0),
    2
  ) AS cancellation_percentage
FROM resources r
LEFT JOIN reservations res ON r.id = res.resource_id
GROUP BY r.id, r.name, r.resource_type;

-- ============================================================================
-- 5. VIEW: vw_peak_booking_hours
--
-- Purpose & Dashboard Usage:
--   Groups confirmed campus reservations by hour of day (0 to 23 based on
--   Asia/Kolkata start time) to identify peak demand hours across campus.
--   Powers peak-hour utilization heatmaps and scheduling analytics.
--   Fully compatible with ONLY_FULL_GROUP_BY sql_mode.
-- ============================================================================
CREATE VIEW vw_peak_booking_hours AS
SELECT 
  HOUR(start_at) AS hour_of_day,
  CONCAT(LPAD(HOUR(start_at), 2, '0'), ':00 - ', LPAD(HOUR(start_at) + 1, 2, '0'), ':00') AS time_slot_label,
  COUNT(*) AS total_bookings_starting_in_hour,
  COUNT(DISTINCT user_id) AS distinct_active_bookers,
  COUNT(DISTINCT resource_id) AS distinct_resources_booked
FROM reservations
WHERE status = 'CONFIRMED'
GROUP BY HOUR(start_at), CONCAT(LPAD(HOUR(start_at), 2, '0'), ':00 - ', LPAD(HOUR(start_at) + 1, 2, '0'), ':00')
ORDER BY total_bookings_starting_in_hour DESC, hour_of_day ASC;
