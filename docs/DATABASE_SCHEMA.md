# Campus Resource Booking & Waitlist Management System
## Database Architecture & Relational Schema Specification

### 1. Database Overview & Environment Standards
- **RDBMS Engine**: MySQL 26.7.0 (InnoDB Storage Engine)
- **Database Name**: `campus_reserve`
- **Character Set & Collation**: `utf8mb4` / `utf8mb4_unicode_ci`
- **Timezone Convention**: **Asia/Kolkata (IST / UTC+05:30)**
  - All reservation intervals (`start_at`, `end_at`), waitlist requests (`requested_start_at`, `requested_end_at`), and status history timestamps are stored and interpreted consistently using **Asia/Kolkata (IST)**.
  - The application connection pool is configured with `dateStrings: true` and `timezone: '+05:30'`, preventing automatic JavaScript Date conversions to UTC and ensuring zero timezone drift.
  - MySQL system timezone is verified as `IST`.

---

### 2. Complete SQL Execution & Recreation Order

To recreate the entire relational database layer from scratch without guessing:

```bash
# 1. Base Relational Schema & Tables
mysql -u root campus_reserve < db/schema.sql

# 2. Database Roles & Grants
mysql -u root campus_reserve < db/roles.sql

# 3. Stored Functions
mysql -u root campus_reserve < db/functions.sql

# 4. Triggers (Engine-level conflict checks & audit logging)
mysql -u root campus_reserve < db/triggers.sql

# 5. Stored Procedures (Transactional booking & automated waitlist)
mysql -u root campus_reserve < db/procedures.sql

# 6. Relational Views (Analytics, utilization & history)
mysql -u root campus_reserve < db/views.sql

# 7. Reproducible Seed Data
node scripts/seed.mjs

# 8. Advanced SQL Academic Queries (optional demonstration)
mysql -u root campus_reserve < db/advanced_queries.sql

# 9. Verification Test Suites
node scripts/test-phase2.mjs
node scripts/test-phase3.mjs
```

---

### 3. Stored Functions: `fn_is_resource_available`

Defined in [`db/functions.sql`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/db/functions.sql):
- **Signature**: `fn_is_resource_available(p_resource_id, p_start_at, p_end_at) RETURNS BOOLEAN`
- **Logic**:
  - Validates `p_end_at > p_start_at`.
  - Verifies resource existence and `is_active = TRUE`.
  - Checks for overlapping CONFIRMED reservations using the formula:
    ```sql
    start_at < p_end_at AND end_at > p_start_at AND status = 'CONFIRMED'
    ```
  - Ignores `CANCELLED` bookings.
  - Back-to-back reservations (e.g., 09:00-11:00 and 11:00-13:00) do NOT overlap.
- **Operational Scope**:
  - Acts as a high-speed read/check function for catalog searches, availability queries, and views.
  - **Important**: It is a read-only probe and not a substitute for transaction row locking (`SELECT ... FOR UPDATE`) during atomic booking requests.

---

### 4. Stored Procedures: Core Transaction Engine

Defined in [`db/procedures.sql`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/db/procedures.sql):

#### 4.1 `sp_request_reservation`
- **Inputs**: `(p_user_id, p_resource_id, p_start_at, p_end_at, p_purpose, p_priority_level)`
- **Outputs**: `(p_outcome, p_booking_id, p_waitlist_id, p_message)`
- **Transaction & Concurrency Safety**:
  1. Validates interval and requesting user status.
  2. Begins an InnoDB transaction (`START TRANSACTION`).
  3. Executes `SELECT ... FROM resources WHERE id = p_resource_id FOR UPDATE`, acquiring an exclusive row lock on the target resource.
  4. This serializes all simultaneous requests for that resource, preventing race conditions.
  5. If available: inserts into `reservations` with status `CONFIRMED`.
  6. If conflict exists: inserts into `waitlist_entries` with status `WAITING` and effective priority level (default = 5, bounded 1-10).
  7. Handled with `DECLARE EXIT HANDLER FOR SQLEXCEPTION` with immediate `ROLLBACK`.

#### 4.2 `sp_cancel_and_process_waitlist`
- **Inputs**: `(p_reservation_id, p_requester_user_id, p_requester_role)`
- **Outputs**: `(p_cancellation_status, p_promoted_reservation_id, p_promoted_user_id, p_promoted_waitlist_id, p_message)`
- **Authorization & Security Model**:
  - Validates that the reservation exists and is currently `CONFIRMED`.
  - **Ownership check**: Requester must match `user_id` of the booking OR have role `'ADMIN'`. Unauthorized cancellations by other students are rejected.
  - *Academic Security Note*: Procedure parameters are validated, but client-supplied user IDs are inherently untrusted; the Next.js backend must always supply the authenticated user ID derived from the verified session/JWT.
- **Automated Waitlist Promotion Engine**:
  1. Acquires exclusive locks on the reservation and resource rows.
  2. Updates reservation status to `CANCELLED` (triggers record the audit trail).
  3. Opens a cursor iterating eligible `WAITING` entries for that resource in strict priority order:
     ```sql
     ORDER BY priority_level ASC, joined_at ASC
     ```
  4. Evaluates whether the candidate's requested interval is completely conflict-free.
  5. The first candidate whose window is clear is promoted:
     - New `CONFIRMED` reservation created.
     - Waitlist entry updated to `PROMOTED` with timestamp and foreign key link.
  6. Commits the transaction atomically.

---

### 5. Database Triggers

Defined in [`db/triggers.sql`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/db/triggers.sql):

| Trigger Name | Timing | Table | Purpose |
|---|---|---|---|
| `trg_reservations_before_insert` | `BEFORE INSERT` | `reservations` | Validates `end_at > start_at`, checks `resources.is_active`, and blocks overlapping `CONFIRMED` intervals at the database engine level. |
| `trg_reservations_before_update` | `BEFORE UPDATE` | `reservations` | Prevents interval corruption and overlapping `CONFIRMED` intervals (excluding self via `id <> NEW.id`). Automatically timestamps `cancelled_at = NOW()`. |
| `trg_reservations_after_insert` | `AFTER INSERT` | `reservations` | Authoritatively logs initial creation (`old_status = 'NONE'`, `new_status = NEW.status`) in `reservation_status_history`. |
| `trg_reservations_after_update` | `AFTER UPDATE` | `reservations` | Authoritatively logs status transitions (`CONFIRMED -> CANCELLED`, etc.) in `reservation_status_history`. Prevents duplicate logging between stored procedures and direct SQL. |

*Note*: MySQL triggers do not attempt to write directly to MongoDB. MongoDB event streaming is handled by the Next.js backend in Phase 4.

---

### 6. Relational Views for Reporting & Dashboards

Defined in [`db/views.sql`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/db/views.sql):

1. **`vw_resource_availability`**:
   - Aggregates resource catalog metadata, active upcoming bookings, waitlist queue count, and next scheduled booking time.
   - Used by the Resource Directory UI.
2. **`vw_resource_utilization`**:
   - Calculates total confirmed bookings, cumulative utilized minutes/hours, and average duration per facility. Strictly excludes cancelled bookings.
   - Powers administrator capacity utilization dashboards.
3. **`vw_booking_history`**:
   - Multi-table join linking reservations, users, and resources with computed durations.
   - Powers the Student "My Reservations" dashboard and Admin booking log.
4. **`vw_cancellation_summary`**:
   - Analyzes total bookings, confirmed counts, cancellation counts, and cancellation percentage per venue.
   - Identifies high-churn facilities.
5. **`vw_peak_booking_hours`**:
   - Groups bookings by hour of day (0-23 in Asia/Kolkata) with distinct user and venue counts.
   - Compatible with `ONLY_FULL_GROUP_BY`. Powers peak-hour heatmaps.

---

### 7. Advanced SQL Demonstration Queries

Defined in [`db/advanced_queries.sql`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/db/advanced_queries.sql) for academic DBMS evaluation:
- **Inner Join & Multi-table Relational Query**: 3-table projection with duration calculations.
- **Left Outer Join with Aggregation**: Preserves zero-booking catalog items.
- **Nested Subquery**: Filters resources whose average duration exceeds the campus-wide average.
- **Correlated Subquery**: Correlates outer reservation resource ID with inner `MAX(created_at)`.
- **Common Table Expression (CTE)**: Categorizes student booking tiers based on total hours utilized.
- **Recursive CTE**: `WITH RECURSIVE CalendarDates` generates a continuous 7-day date dimension and produces a zero-padded daily reservation report.
- **GROUP BY & HAVING**: Identifies facilities with >= 2 bookings and average duration >= 90 minutes.
- **Peak Hours Analysis**: Extracts `HOUR(start_at)` and ranks peak campus demand slots.
- **Seat-Hours Metric**: Computes capacity-weighted utilization (`total_hours * capacity`).
- **Cancellation Reason Breakdown**: Analyzes cancellation frequency and audit history reasons.
- **Priority Queue Listing**: Orders waitlist by `priority_level ASC, joined_at ASC`.

---

### 8. Automated Test Suites & Verification

- **Phase 2 Suite**: `node scripts/test-phase2.mjs` -> **14/14 tests passed (100%)**.
- **Phase 3 Suite**: `node scripts/test-phase3.mjs` -> **20/20 tests passed (100%)**:
  1. Successful reservation confirmation.
  2. Overlapping reservation waitlisted.
  3. Back-to-back boundary reservations permitted.
  4. Partial overlap rejected/waitlisted.
  5. Cancelled reservations do not block availability.
  6. Invalid interval (`end <= start`) rejected.
  7. Inactive resource booking rejected.
  8. Inactive/nonexistent user booking rejected.
  9. Owner cancellation succeeds.
  10. Unauthorized student cancellation rejected.
  11. Admin cancellation succeeds.
  12. Correct waitlist promotion after cancellation.
  13. Priority 2 candidate promoted over earlier joined Priority 3 candidate.
  14. FIFO ordering enforced for equal priority candidates.
  15. Ineligible waitlist candidate skipped when interval still conflicts with remaining bookings.
  16. Status changes authoritatively generate audit records.
  17. Direct invalid INSERT/UPDATE rejected by triggers.
  18. Deleting reservations with audit records rejected (`ON DELETE RESTRICT`).
  19. Transaction rollback preserves database consistency.
  20. Simultaneous concurrent booking requests on separate connections serialized via `SELECT ... FOR UPDATE` (exactly 1 confirmed, 1 waitlisted).
