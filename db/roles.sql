-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Database Roles & Least-Privilege Access Control (MySQL 8)
-- File: db/roles.sql
-- ============================================================================

USE campus_reserve;

-- Create Roles if they do not exist
CREATE ROLE IF NOT EXISTS 'campus_student_role';
CREATE ROLE IF NOT EXISTS 'campus_admin_role';
CREATE ROLE IF NOT EXISTS 'campus_auth_role';

-- ============================================================================
-- 1. campus_student_role: Restricted Student Access
-- Students can:
--   - View active resources and existing reservations for conflict check
--   - Insert their own reservations and waitlist entries
--   - Update/cancel their own reservations and waitlist entries
--   - View reservation status history
-- Students CANNOT:
--   - Modify resource definitions, buildings, floors, or capacities
--   - Modify or delete other users' accounts
--   - Delete reservations directly (must update status to CANCELLED)
--   - Access password hashes
-- ============================================================================
GRANT SELECT ON campus_reserve.resources TO 'campus_student_role';
GRANT SELECT, INSERT, UPDATE (status, cancelled_at, purpose) ON campus_reserve.reservations TO 'campus_student_role';
GRANT SELECT, INSERT, UPDATE (status, requested_start_at, requested_end_at) ON campus_reserve.waitlist_entries TO 'campus_student_role';
GRANT SELECT, INSERT ON campus_reserve.reservation_status_history TO 'campus_student_role';
GRANT SELECT (id, full_name, email, role, is_active) ON campus_reserve.users TO 'campus_student_role';

-- ============================================================================
-- 2. campus_admin_role: Resource & Reservation Management
-- Administrators can:
--   - Administer resources (create, update, activate/deactivate, delete)
--   - View, update, or cancel any reservation or waitlist entry
--   - Audit status changes and access all table data
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON campus_reserve.resources TO 'campus_admin_role';
GRANT SELECT, INSERT, UPDATE, DELETE ON campus_reserve.reservations TO 'campus_admin_role';
GRANT SELECT, INSERT, UPDATE, DELETE ON campus_reserve.waitlist_entries TO 'campus_admin_role';
GRANT SELECT, INSERT, UPDATE, DELETE ON campus_reserve.reservation_status_history TO 'campus_admin_role';
GRANT SELECT, INSERT, UPDATE ON campus_reserve.users TO 'campus_admin_role';

-- ============================================================================
-- 3. campus_auth_role: Authentication & Credential Verification
-- Used by the authentication module for credential checking, password hash
-- verification, session issuance, and user onboarding.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE (password_hash, is_active, updated_at) ON campus_reserve.users TO 'campus_auth_role';

-- ============================================================================
-- HOW TO ASSIGN ROLES TO APPLICATION SERVICE ACCOUNTS:
--
-- Notice: Actual passwords are NOT hardcoded in source control and must be
-- supplied via environment variables (MYSQL_USER, MYSQL_PASSWORD).
--
-- Security Model Architecture:
-- 1. The Next.js Backend connects using dedicated application credentials.
-- 2. End-user credentials (students/admins) authenticate against password_hash
--    via the backend authentication handler.
-- 3. In Phase 3, fine-grained row-level authorization (preventing Student A
--    from modifying Student B's reservation) is enforced at the database layer
--    via MySQL Stored Procedures (DEFINER security context) that take session
--    context and validate ownership before updating reservations.
--
-- Example of creating a dedicated application user and binding roles:
--
--   CREATE USER IF NOT EXISTS 'campus_app'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';
--   GRANT 'campus_admin_role', 'campus_student_role', 'campus_auth_role' TO 'campus_app'@'localhost';
--   SET DEFAULT ROLE ALL TO 'campus_app'@'localhost';
--   FLUSH PRIVILEGES;
-- ============================================================================

FLUSH PRIVILEGES;
