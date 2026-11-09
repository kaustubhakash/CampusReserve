-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Runnable DML Query Demonstrations & Transaction Patterns (MySQL 8)
-- File: db/dml_examples.sql
-- Timezone Convention: Asia/Kolkata (IST)
-- ============================================================================

USE campus_reserve;

-- ============================================================================
-- 1. INSERT OPERATIONS
-- ============================================================================

-- 1.1 Insert a new student user
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES (
  'Meera Krishnan',
  'meera.krishnan@student.campus.edu',
  '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhashforinsertdemo',
  'STUDENT',
  TRUE
);

-- 1.2 Insert a new campus facility
INSERT INTO resources (name, resource_type, building, floor, room_number, capacity, description, is_active)
VALUES (
  'Quantum Computing & Photonics Lab',
  'LAB',
  'Homi Bhabha Advanced Science Block',
  4,
  'HB-401',
  30,
  'Specialized laboratory with optical breadboards and cryogenic simulation terminals.',
  TRUE
);

-- ============================================================================
-- 2. SELECT OPERATIONS WITH RELATIONAL JOINS
-- ============================================================================

-- 2.1 View all active reservations with student details and resource venue
SELECT 
  res.id AS reservation_id,
  u.full_name AS student_name,
  u.email AS student_email,
  r.name AS resource_name,
  r.resource_type,
  CONCAT(r.building, ' Floor ', r.floor, ' (', r.room_number, ')') AS location,
  res.start_at,
  res.end_at,
  TIMESTAMPDIFF(MINUTE, res.start_at, res.end_at) AS duration_minutes,
  res.purpose,
  res.status
FROM reservations res
JOIN users u ON res.user_id = u.id
JOIN resources r ON res.resource_id = r.id
WHERE res.status = 'CONFIRMED'
ORDER BY res.start_at ASC;

-- 2.2 View waitlist queue ordered by priority ASC (1 is highest) and time joined (FIFO)
SELECT 
  w.id AS waitlist_id,
  r.name AS requested_resource,
  u.full_name AS student_name,
  w.priority_level,
  w.requested_start_at,
  w.requested_end_at,
  w.status AS waitlist_status,
  w.joined_at
FROM waitlist_entries w
JOIN users u ON w.user_id = u.id
JOIN resources r ON w.resource_id = r.id
WHERE w.status = 'WAITING'
ORDER BY w.resource_id, w.priority_level ASC, w.joined_at ASC;

-- ============================================================================
-- 3. ARBITRARY INTERVAL OVERLAP CONFLICT DETECTION QUERY
-- ============================================================================
-- Checks if a requested window (e.g., Turing Lab on 2026-11-10 from 10:00 to 12:00)
-- overlaps with any existing CONFIRMED booking.
-- Overlap formula: existing.start_at < requested.end_at AND existing.end_at > requested.start_at
SELECT 
  res.id AS conflicting_reservation_id,
  r.name AS resource_name,
  u.full_name AS booked_by,
  res.start_at,
  res.end_at,
  res.status
FROM reservations res
JOIN resources r ON res.resource_id = r.id
JOIN users u ON res.user_id = u.id
WHERE res.resource_id = (SELECT id FROM resources WHERE name = 'Turing Advanced AI & Computing Lab' LIMIT 1)
  AND res.status = 'CONFIRMED'
  AND res.start_at < '2026-11-10 12:00:00'
  AND res.end_at > '2026-11-10 10:00:00';

-- ============================================================================
-- 4. ATOMIC TRANSACTION: CREATE RESERVATION WITH AUDIT LOGGING
-- ============================================================================
START TRANSACTION;

-- Step 1: Ensure resource is locked against concurrent interval insertions
SELECT id, name, is_active 
FROM resources 
WHERE id = (SELECT id FROM resources WHERE name = 'Smart Interactive Classroom 204' LIMIT 1)
FOR UPDATE;

-- Step 2: Insert confirmed reservation
INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
VALUES (
  (SELECT id FROM users WHERE email = 'meera.krishnan@student.campus.edu'),
  (SELECT id FROM resources WHERE name = 'Smart Interactive Classroom 204' LIMIT 1),
  '2026-11-13 14:00:00',
  '2026-11-13 16:00:00',
  'Graduate Seminar on Formal Database Verification',
  'CONFIRMED'
);

SET @new_res_id = LAST_INSERT_ID();

-- Step 3: Insert initial status audit record
INSERT INTO reservation_status_history (
  reservation_id,
  old_status,
  new_status,
  changed_by,
  change_source,
  reason
) VALUES (
  @new_res_id,
  'NONE',
  'CONFIRMED',
  (SELECT id FROM users WHERE email = 'meera.krishnan@student.campus.edu'),
  'USER_ACTION',
  'Direct booking creation verified without interval conflict'
);

COMMIT;

-- ============================================================================
-- 5. ATOMIC TRANSACTION: CANCEL RESERVATION WITH AUDIT TRAIL
-- ============================================================================
START TRANSACTION;

-- Step 1: Lock and verify the reservation
SELECT id, status 
FROM reservations 
WHERE id = @new_res_id
FOR UPDATE;

-- Step 2: Update status to CANCELLED and set timestamp
UPDATE reservations 
SET status = 'CANCELLED',
    cancelled_at = '2026-11-09 10:30:00'
WHERE id = @new_res_id AND status = 'CONFIRMED';

-- Step 3: Insert cancellation audit log entry
INSERT INTO reservation_status_history (
  reservation_id,
  old_status,
  new_status,
  changed_by,
  change_source,
  reason,
  changed_at
) VALUES (
  @new_res_id,
  'CONFIRMED',
  'CANCELLED',
  (SELECT id FROM users WHERE email = 'meera.krishnan@student.campus.edu'),
  'USER_ACTION',
  'Cancelled by student prior to scheduled date',
  '2026-11-09 10:30:00'
);

COMMIT;

-- ============================================================================
-- 6. UPDATE OPERATIONS
-- ============================================================================

-- 6.1 Update resource capacity and maintenance notes
UPDATE resources 
SET capacity = 50,
    description = 'High-performance computing lab with upgraded NVIDIA RTX 4090 GPU workstations.'
WHERE name = 'Turing Advanced AI & Computing Lab';

-- 6.2 Update waitlist entry priority (e.g. elevating priority from 2 to 1)
UPDATE waitlist_entries
SET priority_level = 1
WHERE user_id = (SELECT id FROM users WHERE email = 'rohan.verma@student.campus.edu')
  AND status = 'WAITING';

-- ============================================================================
-- 7. CLEANUP / DELETE DEMONSTRATION
-- ============================================================================
-- Remove the demonstration user created above (with foreign key integrity)
DELETE FROM reservation_status_history WHERE reservation_id = @new_res_id;
DELETE FROM reservations WHERE id = @new_res_id;
DELETE FROM users WHERE email = 'meera.krishnan@student.campus.edu';
DELETE FROM resources WHERE name = 'Quantum Computing & Photonics Lab';
