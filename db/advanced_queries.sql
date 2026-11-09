-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Advanced SQL Demonstration Queries for Academic DBMS Evaluation
-- Database: campus_reserve
-- File: db/advanced_queries.sql
-- ============================================================================

USE campus_reserve;

-- ============================================================================
-- 1. INNER JOIN & MULTI-TABLE RELATIONAL QUERY
-- Demonstrates: Multi-table relational projection joining 3 core entities
-- Purpose: Retrieves confirmed reservations with student profile, resource details,
-- and computed duration in minutes.
-- ============================================================================
SELECT 
  res.id AS reservation_id,
  u.full_name AS student_name,
  u.email AS student_email,
  r.name AS resource_name,
  r.resource_type,
  CONCAT(r.building, ', Floor ', r.floor, ' (', r.room_number, ')') AS venue,
  res.start_at,
  res.end_at,
  TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) AS duration_minutes,
  res.purpose
FROM reservations res
INNER JOIN users u ON res.user_id = u.id
INNER JOIN resources r ON res.resource_id = r.id
WHERE res.status = 'CONFIRMED'
ORDER BY res.start_at ASC;

-- ============================================================================
-- 2. LEFT OUTER JOIN WITH AGGREGATION & ZERO-HANDLING
-- Demonstrates: LEFT OUTER JOIN preserving all catalog items, COUNT with conditional logic
-- Purpose: Evaluates all campus resources, including those with zero current reservations,
-- calculating booking activity and waitlist interest.
-- ============================================================================
SELECT 
  r.id AS resource_id,
  r.name AS resource_name,
  r.resource_type,
  r.capacity,
  COUNT(DISTINCT res.id) AS total_confirmed_bookings,
  COUNT(DISTINCT wl.id) AS total_waitlisted_requests
FROM resources r
LEFT JOIN reservations res 
  ON r.id = res.resource_id AND res.status = 'CONFIRMED'
LEFT JOIN waitlist_entries wl 
  ON r.id = wl.resource_id AND wl.status = 'WAITING'
GROUP BY r.id, r.name, r.resource_type, r.capacity
ORDER BY total_confirmed_bookings DESC, total_waitlisted_requests DESC;

-- ============================================================================
-- 3. NESTED SUBQUERY (IN / NOT IN / SCALAR)
-- Demonstrates: Nested subquery in WHERE clause with aggregate filtering
-- Purpose: Finds resources whose average booking duration exceeds the campus-wide
-- average booking duration across all confirmed reservations.
-- ============================================================================
SELECT 
  r.id,
  r.name,
  r.resource_type,
  ROUND(AVG(TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at)), 1) AS avg_resource_duration_mins
FROM resources r
JOIN reservations res ON r.id = res.resource_id
WHERE res.status = 'CONFIRMED'
GROUP BY r.id, r.name, r.resource_type
HAVING AVG(TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at)) > (
  -- Scalar nested subquery: campus-wide average duration
  SELECT AVG(TIMESTAMPDIFF(MINUTE, start_at, end_at))
  FROM reservations
  WHERE status = 'CONFIRMED'
);

-- ============================================================================
-- 4. CORRELATED SUBQUERY
-- Demonstrates: Subquery referencing an outer query column (res.resource_id)
-- Purpose: For each confirmed reservation, determines whether it is the most recent
-- booking placed for that specific campus facility.
-- ============================================================================
SELECT 
  res.id AS reservation_id,
  r.name AS resource_name,
  u.full_name AS student_name,
  res.start_at,
  res.end_at
FROM reservations res
JOIN resources r ON res.resource_id = r.id
JOIN users u ON res.user_id = u.id
WHERE res.status = 'CONFIRMED'
  AND res.created_at = (
    -- Correlated subquery: max creation timestamp for the same resource
    SELECT MAX(inner_res.created_at)
    FROM reservations inner_res
    WHERE inner_res.resource_id = res.resource_id
      AND inner_res.status = 'CONFIRMED'
  );

-- ============================================================================
-- 5. COMMON TABLE EXPRESSIONS (CTEs)
-- Demonstrates: Modular query design with CTE (`WITH` clause) and windowing
-- Purpose: Computes user reservation volume and classifies student booking tiers
-- based on total confirmed hours utilized.
-- ============================================================================
WITH UserUtilizationStats AS (
  SELECT 
    u.id AS user_id,
    u.full_name,
    u.email,
    COUNT(res.id) AS confirmed_bookings_count,
    COALESCE(SUM(TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at)), 0) / 60.0 AS total_hours_booked
  FROM users u
  LEFT JOIN reservations res ON u.id = res.user_id AND res.status = 'CONFIRMED'
  WHERE u.role = 'STUDENT'
  GROUP BY u.id, u.full_name, u.email
)
SELECT 
  user_id,
  full_name,
  email,
  confirmed_bookings_count,
  ROUND(total_hours_booked, 2) AS total_hours_booked,
  CASE 
    WHEN total_hours_booked >= 4.0 THEN 'High Utilization (Power Booker)'
    WHEN total_hours_booked > 0 THEN 'Moderate Utilization'
    ELSE 'Zero Utilization (Idle Account)'
  END AS utilization_tier
FROM UserUtilizationStats
ORDER BY total_hours_booked DESC, full_name ASC;

-- ============================================================================
-- 6. RECURSIVE COMMON TABLE EXPRESSION (Recursive CTE)
-- Demonstrates: Recursive CTE (`WITH RECURSIVE`) generating an arbitrary date series
-- Purpose: Generates a continuous daily date dimension (from 2026-11-08 to 2026-11-14)
-- and joins it with reservations to produce a zero-padded daily reservation report,
-- ensuring days with no bookings still appear with a count of 0.
-- ============================================================================
WITH RECURSIVE CalendarDates AS (
  -- Anchor member: start date of report window
  SELECT CAST('2026-11-08' AS DATE) AS calendar_date
  UNION ALL
  -- Recursive member: increment day until end date
  SELECT DATE_ADD(calendar_date, INTERVAL 1 DAY)
  FROM CalendarDates
  WHERE calendar_date < '2026-11-14'
)
SELECT 
  c.calendar_date,
  DAYNAME(c.calendar_date) AS day_of_week,
  COUNT(res.id) AS total_bookings_on_day,
  COUNT(CASE WHEN res.status = 'CONFIRMED' THEN 1 END) AS confirmed_count,
  COUNT(CASE WHEN res.status = 'CANCELLED' THEN 1 END) AS cancelled_count
FROM CalendarDates c
LEFT JOIN reservations res 
  ON CAST(res.start_at AS DATE) = c.calendar_date
GROUP BY c.calendar_date, DAYNAME(c.calendar_date)
ORDER BY c.calendar_date ASC;

-- ============================================================================
-- 7. GROUP BY, HAVING & AGGREGATE FUNCTIONS
-- Demonstrates: Aggregation with FILTERING using HAVING on post-group metrics
-- Purpose: Identifies high-demand resource venues that have accumulated at least
-- 2 confirmed bookings with an average duration >= 90 minutes.
-- ============================================================================
SELECT 
  r.name AS resource_name,
  r.resource_type,
  COUNT(res.id) AS confirmed_bookings,
  MIN(res.start_at) AS earliest_booking,
  MAX(res.end_at) AS latest_booking,
  ROUND(AVG(TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at)), 1) AS avg_duration_mins
FROM resources r
JOIN reservations res ON r.id = res.resource_id
WHERE res.status = 'CONFIRMED'
GROUP BY r.id, r.name, r.resource_type
HAVING COUNT(res.id) >= 2 
   AND AVG(TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at)) >= 90;

-- ============================================================================
-- 8. PEAK BOOKING HOURS ANALYSIS
-- Demonstrates: Date/Time part extraction, conditional aggregation, and sorting
-- Purpose: Identifies the busiest time slots across campus facilities to optimize
-- facility maintenance schedules and lab opening hours.
-- ============================================================================
SELECT 
  HOUR(start_at) AS hour_slot,
  CONCAT(LPAD(HOUR(start_at), 2, '0'), ':00 - ', LPAD(HOUR(start_at) + 1, 2, '0'), ':00') AS time_window,
  COUNT(*) AS total_bookings_started,
  COUNT(DISTINCT resource_id) AS distinct_venues_used,
  COUNT(DISTINCT user_id) AS distinct_students_served
FROM reservations
WHERE status = 'CONFIRMED'
GROUP BY HOUR(start_at), CONCAT(LPAD(HOUR(start_at), 2, '0'), ':00 - ', LPAD(HOUR(start_at) + 1, 2, '0'), ':00')
ORDER BY total_bookings_started DESC, hour_slot ASC;

-- ============================================================================
-- 9. RESOURCE UTILIZATION RATE CALCULATION
-- Demonstrates: Mathematical expressions, NULLIF, and percentage calculations
-- Purpose: Computes capacity-adjusted utilization metrics for campus auditoriums
-- and computer laboratories.
-- ============================================================================
SELECT 
  r.name,
  r.resource_type,
  r.capacity,
  COUNT(CASE WHEN res.status = 'CONFIRMED' THEN res.id END) AS confirmed_bookings,
  ROUND(COALESCE(SUM(CASE WHEN res.status = 'CONFIRMED' THEN TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) END), 0) / 60.0, 2) AS total_hours_booked,
  ROUND(
    (COALESCE(SUM(CASE WHEN res.status = 'CONFIRMED' THEN TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) END), 0) / 60.0) * r.capacity,
    1
  ) AS total_student_seat_hours_served
FROM resources r
LEFT JOIN reservations res ON r.id = res.resource_id
GROUP BY r.id, r.name, r.resource_type, r.capacity
ORDER BY total_student_seat_hours_served DESC;

-- ============================================================================
-- 10. CANCELLATION ANALYSIS WITH REASON BREAKDOWN
-- Demonstrates: Multi-table JOIN with audit history table and status filtering
-- Purpose: Identifies root causes and frequency of booking cancellations
-- ============================================================================
SELECT 
  res.id AS reservation_id,
  r.name AS resource_name,
  u.full_name AS student_name,
  res.start_at,
  res.cancelled_at,
  h.change_source,
  h.reason AS cancellation_reason
FROM reservations res
JOIN resources r ON res.resource_id = r.id
JOIN users u ON res.user_id = u.id
JOIN reservation_status_history h 
  ON res.id = h.reservation_id AND h.new_status = 'CANCELLED'
WHERE res.status = 'CANCELLED'
ORDER BY res.cancelled_at DESC;

-- ============================================================================
-- 11. WAITLIST PRIORITY & FIFO QUEUE ORDERING
-- Demonstrates: Multi-column priority ordering conforming to academic specification
-- (1 is highest, 10 is lowest; earlier joined_at wins ties)
-- Purpose: Lists the active waitlist queue for each facility in strict evaluation order.
-- ============================================================================
SELECT 
  w.id AS waitlist_id,
  r.name AS resource_name,
  u.full_name AS student_name,
  w.priority_level,
  w.requested_start_at,
  w.requested_end_at,
  w.joined_at,
  TIMESTAMPDIFF(MINUTE, w.joined_at, NOW()) AS minutes_waiting_in_queue,
  w.status
FROM waitlist_entries w
JOIN resources r ON w.resource_id = r.id
JOIN users u ON w.user_id = u.id
WHERE w.status = 'WAITING'
ORDER BY w.resource_id ASC, w.priority_level ASC, w.joined_at ASC;
