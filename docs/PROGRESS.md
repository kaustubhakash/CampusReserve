# Campus Resource Booking & Waitlist Management System
## Project Progress & Roadmap Tracker

### Project Specification Overview
- **Frontend / Backend**: Next.js (App Router / Route Handlers) with TypeScript & Tailwind CSS
- **Relational DB**: MySQL 26.7.0 (InnoDB) using raw, parameterized SQL (`mysql2/promise`)
- **NoSQL DB**: MongoDB using official `mongodb` driver for activity logs, audit records, and cancellations
- **Academic Requirements**: ER diagram, Relational schema, DDL/DML, JOINs, Nested/Correlated queries, CTEs, Recursive CTEs, Stored Functions, Stored Procedures, Triggers, Views, MongoDB CRUD & Aggregation pipelines, DB-level privileges, RBAC (Student & Admin).

---

### Phase Status Tracker

| Phase | Description | Status | Notes |
|---|---|---|---|
| **Phase 0** | Workspace initialization, synopsis review, baseline docs | **Completed** | Initial setup and roadmap defined |
| **Phase 1** | Environment & Project Initialization (Next.js, Tailwind, MySQL & MongoDB Connection Modules, Health APIs, Initial UI) | **Completed** | Dev server verified on `http://localhost:3000`, health endpoints passing |
| **Phase 2** | MySQL Database Design & Implementation (Schema, Constraints, Indexes, Roles, Seed Data, DML Examples) | **Completed** | 5 tables, 26 constraints, composite indexes, 3 MySQL roles, seed script, DML test queries verified |
| **Pre-Phase 3 Review** | Targeted Database Review & Integrity Corrections (Waitlist ASC Priority, Audit Preservation RESTRICT, Column Security, Timezone Consistency, Automated Test Suite) | **Completed** | 14/14 automated tests passing via `scripts/test-phase2.mjs` |
| **Phase 3** | Database Logic: Stored Procedures, Stored Functions, Triggers & Views (MySQL 8) | Pending | Awaiting Phase 3 prompt |
| **Phase 4** | MongoDB Collections, Schemas, Indexes & Seed data setup | Pending | Awaiting prompt |
| **Phase 5** | Authentication, RBAC (Student & Admin), Session/Token validation | Pending | Awaiting prompt |
| **Phase 6** | Core Booking Engine, Conflict Detection, InnoDB Transactions & Stored Proc Integration | Pending | Awaiting prompt |
| **Phase 7** | Automated Waitlist Management & Priority-based Auto-Promotion on Cancellation | Pending | Awaiting prompt |
| **Phase 8** | Analytics & Reporting (Advanced SQL queries: CTEs, Recursive CTEs, Joins + MongoDB Aggregations) | Pending | Awaiting prompt |
| **Phase 9** | Student & Admin UI Dashboards (Next.js + Tailwind CSS) | Pending | Awaiting prompt |
| **Phase 10** | End-to-end Integration, Unit/Integration Testing, ER Diagram & Final Academic Documentation | Pending | Awaiting prompt |

---

### Pre-Phase 3 Review & Corrections Log
- **Targeted Database Corrections**:
  1. **Waitlist Priority Ordering Policy**:
     - Corrected queue order to `ORDER BY priority_level ASC, joined_at ASC` (since priority 1 is highest, 10 is lowest).
     - Dropped descending index and recreated composite index `idx_waitlist_queue ON waitlist_entries (resource_id, status, priority_level ASC, joined_at ASC)`.
     - Updated `db/dml_examples.sql`, `scripts/seed.mjs`, and documentation.
  2. **Audit History Preservation**:
     - Corrected foreign key `reservation_status_history.fk_history_reservation` from `ON DELETE CASCADE` to `ON DELETE RESTRICT`.
     - Deleting a reservation that has status audit records is now rejected (`ER_ROW_IS_REFERENCED_2`), preventing accidental deletion of audit history.
  3. **Role Security Hardening**:
     - Refined `campus_student_role` to restrict `UPDATE` to non-relational columns `(status, cancelled_at, purpose)` on `reservations` and `(status, requested_start_at, requested_end_at)` on `waitlist_entries`.
     - Confirmed column-level protection on `users`: `password_hash` access denied to student role.
     - Documented procedure-driven row-level ownership validation for Phase 3.
  4. **Timezone Consistency**:
     - Verified MySQL system timezone is `IST` (Asia/Kolkata).
     - Configured MySQL connection pool (`src/lib/db/mysql.ts`) with `dateStrings: true` and `timezone: '+05:30'`, preventing automatic JavaScript Date UTC conversions and ensuring reservation intervals are treated as exact literal strings.
  5. **Automated Test Suite**:
     - Created `scripts/test-phase2.mjs` verifying 14 distinct test conditions without corrupting seed data.
- **Commands Executed**:
  - `node scripts/seed.mjs`
  - `node scripts/test-phase2.mjs`
  - `curl -s http://localhost:3000/api/health/mysql`
- **Tests Passed**:
  - All 14 tests in `scripts/test-phase2.mjs` PASSED (100%).
- **Unresolved Problems**: None.
