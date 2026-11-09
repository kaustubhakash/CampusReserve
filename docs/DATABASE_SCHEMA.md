# Campus Resource Booking & Waitlist Management System
## Database Architecture & Relational Schema Specification

### 1. Database Overview & Environment Standards
- **RDBMS Engine**: MySQL 26.7.0 (InnoDB Storage Engine)
- **Database Name**: `campus_reserve`
- **Character Set & Collation**: `utf8mb4` / `utf8mb4_unicode_ci`
- **Timezone Convention**: **Asia/Kolkata (IST / UTC+05:30)**
  - All reservation intervals (`start_at`, `end_at`), waitlist requests (`requested_start_at`, `requested_end_at`), and status history timestamps are stored and interpreted consistently using **Asia/Kolkata (IST)**.
  - The application connection pool is configured with `dateStrings: true` and `timezone: '+05:30'`, preventing automatic JavaScript Date conversions to UTC and eliminating timezone drift.
  - MySQL system timezone is verified as `IST`.

---

### 2. Waitlist Priority Policy & Ordering

The campus waitlist priority policy is defined as:
1. **Priority Level 1 is highest**; Priority Level 10 is lowest.
2. Within equal priority levels, earlier `joined_at` wins (FIFO).
3. All waitlist queries and the composite indexing strictly use:
   ```sql
   ORDER BY priority_level ASC, joined_at ASC
   ```
4. The composite queue index on `waitlist_entries` is:
   ```sql
   CREATE INDEX idx_waitlist_queue 
     ON waitlist_entries (resource_id, status, priority_level ASC, joined_at ASC);
   ```

---

### 3. Relational Schema Architecture

```
   +-------------------------------------------------------+
   |                        USERS                          |
   +-------------------------------------------------------+
   | PK id                 BIGINT UNSIGNED AUTO_INCREMENT  |
   |    full_name          VARCHAR(100)                    |
   | UQ email              VARCHAR(191)                    |
   |    password_hash      VARCHAR(255)                    |
   |    role               ENUM('STUDENT','ADMIN')         |
   |    is_active          BOOLEAN                         |
   |    created_at         DATETIME                        |
   |    updated_at         DATETIME                        |
   +-------------------------------------------------------+
               | 1                                 | 1
               |                                   |
               | N                                 | N
   +---------------------------------------+       |
   |              RESERVATIONS             |       |
   +---------------------------------------+       |
   | PK id            BIGINT UNSIGNED AUTO |       |
   | FK user_id       BIGINT UNSIGNED      |-------+
   | FK resource_id   BIGINT UNSIGNED      |----+
   |    start_at      DATETIME             |    |
   |    end_at        DATETIME             |    |
   |    purpose       VARCHAR(255)         |    |
   |    status        ENUM(CONFIRMED,      |    |
   |                       CANCELLED)      |    |
   |    created_at    DATETIME             |    |
   |    cancelled_at  DATETIME (NULLABLE)  |    |
   +---------------------------------------+    |
         | 1                      ^             |
         | (ON DELETE RESTRICT)   | 0..1        |
         | N                      |             |
   +-----------------------+   +---------------------------------------+
   | RESERVATION_STATUS_   |   |           WAITLIST_ENTRIES            |
   | HISTORY               |   +---------------------------------------+
   +-----------------------+   | PK id                  BIGINT AUTO    |
   | PK id           BIGINT|   | FK user_id             BIGINT         |
   | FK reservation_id     |   | FK resource_id         BIGINT         |
   |    old_status   ENUM  |   |    requested_start_at  DATETIME       |
   |    new_status   ENUM  |   |    requested_end_at    DATETIME       |
   | FK changed_by   BIGINT|   |    priority_level      INT UNSIGNED   |
   |    change_source ENUM |   |    status              ENUM(WAITING,  |
   |    reason       TEXT  |   |                             PROMOTED, |
   |    changed_at   TIME  |   |                             CANCELLED)|
   +-----------------------+   |    joined_at           DATETIME       |
                               |    promoted_at         DATETIME       |
                               | FK promoted_res_id     BIGINT NULL    |
                               | UQ active_waitlist_key GEN STORED     |
                               +---------------------------------------+
                                                | N
                                                |
                                                | 1
                               +---------------------------------------+
                               |               RESOURCES               |
                               +---------------------------------------+
                               | PK id            BIGINT UNSIGNED AUTO |
                               |    name          VARCHAR(120)         |
                               |    resource_type ENUM(LAB, SEMINAR...)|
                               |    building      VARCHAR(80)          |
                               |    floor         INT                  |
                               |    room_number   VARCHAR(30)          |
                               |    capacity      INT UNSIGNED         |
                               |    description   TEXT                 |
                               |    is_active     BOOLEAN              |
                               |    created_at    DATETIME             |
                               |    updated_at    DATETIME             |
                               +---------------------------------------+
```

---

### 4. Table Definitions & Constraints

#### 4.1 `users`
- **Purpose**: Authenticated campus actors (Students and Administrators).
- **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
- **Constraints**:
  - `uq_users_email`: `UNIQUE (email)`.
  - `chk_users_role`: `CHECK (role IN ('STUDENT', 'ADMIN'))`.
  - `chk_users_email_format`: `CHECK (email LIKE '%@%._%')`.

#### 4.2 `resources`
- **Purpose**: Bookable campus facilities (Labs, Seminar Halls, Study Pods, Classrooms, Conference Rooms, Equipment).
- **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
- **Constraints**:
  - `chk_resources_capacity`: `CHECK (capacity > 0)`.
  - `chk_resources_floor`: `CHECK (floor >= -2 AND floor <= 50)`.

#### 4.3 `reservations`
- **Purpose**: Confirmed and cancelled resource bookings.
- **Arbitrary Time Interval Support**: `start_at` and `end_at` support arbitrary times.
- **Overlap Logic**:
  ```sql
  existing.start_at < requested.end_at AND existing.end_at > requested.start_at
  ```
  Only `status = 'CONFIRMED'` bookings are checked.
- **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys**:
  - `fk_reservations_user`: `user_id -> users(id) ON DELETE RESTRICT ON UPDATE CASCADE`
  - `fk_reservations_resource`: `resource_id -> resources(id) ON DELETE RESTRICT ON UPDATE CASCADE`
- **Constraints**:
  - `chk_reservations_interval`: `CHECK (end_at > start_at)`.
  - `chk_reservations_status`: `CHECK (status IN ('CONFIRMED', 'CANCELLED'))`.
  - `chk_reservations_cancelled_at`: `CHECK ((status = 'CANCELLED' AND cancelled_at IS NOT NULL) OR (status = 'CONFIRMED' AND cancelled_at IS NULL))`.

#### 4.4 `waitlist_entries`
- **Purpose**: Prioritized FIFO waitlist for resource slots when a reservation conflict exists.
- **Duplicate Active Request Prevention Strategy**:
  - Uses a **STORED Generated Column**:
    ```sql
    active_waitlist_key VARCHAR(191) GENERATED ALWAYS AS (
      CASE 
        WHEN status = 'WAITING' THEN 
          CONCAT(user_id, '_', resource_id, '_', DATE_FORMAT(requested_start_at, '%Y%m%d%H%i%s'), '_', DATE_FORMAT(requested_end_at, '%Y%m%d%H%i%s'))
        ELSE NULL 
      END
    ) STORED
    ```
  - Paired with a `UNIQUE KEY (active_waitlist_key)`.
  - Historical entries with status `PROMOTED` or `CANCELLED` evaluate `active_waitlist_key` to `NULL`, allowing retention of audit records without constraint conflict.
- **Foreign Keys**:
  - `fk_waitlist_user`: `user_id -> users(id) ON DELETE RESTRICT ON UPDATE RESTRICT`
  - `fk_waitlist_resource`: `resource_id -> resources(id) ON DELETE RESTRICT ON UPDATE RESTRICT`
  - `fk_waitlist_promoted_reservation`: `promoted_reservation_id -> reservations(id) ON DELETE SET NULL ON UPDATE CASCADE`
- **Constraints**:
  - `chk_waitlist_interval`: `CHECK (requested_end_at > requested_start_at)`.
  - `chk_waitlist_priority`: `CHECK (priority_level >= 1 AND priority_level <= 10)`.
  - `chk_waitlist_status`: `CHECK (status IN ('WAITING', 'PROMOTED', 'CANCELLED'))`.
  - `chk_waitlist_promoted_state`: `CHECK ((status = 'PROMOTED' AND promoted_at IS NOT NULL) OR (status <> 'PROMOTED' AND promoted_at IS NULL))`.

#### 4.5 `reservation_status_history`
- **Purpose**: Immutable audit trail of reservation lifecycle transitions.
- **Primary Key**: `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys**:
  - `fk_history_reservation`: `reservation_id -> reservations(id) ON DELETE RESTRICT ON UPDATE CASCADE`
    - **Audit Preservation Correction**: Using `ON DELETE RESTRICT` ensures that reservations with audit history **cannot be deleted**, preventing accidental or malicious loss of compliance records.
  - `fk_history_changed_by`: `changed_by -> users(id) ON DELETE SET NULL ON UPDATE CASCADE`
- **Constraints**:
  - `chk_history_statuses`: `CHECK (new_status IN ('CONFIRMED', 'CANCELLED') AND old_status IN ('NONE', 'CONFIRMED', 'CANCELLED'))`.

---

### 5. Index Architecture & Justification

| Index Name | Table | Columns | Purpose & Query Optimization |
|---|---|---|---|
| `idx_resources_type_active` | `resources` | `(resource_type, is_active)` | Accelerates user resource search filters by category and availability. |
| `idx_reservations_resource_status_times` | `reservations` | `(resource_id, status, start_at, end_at)` | **Conflict Detection**: Fast composite index range scan verifying `existing.start_at < requested.end_at AND existing.end_at > requested.start_at`. |
| `idx_reservations_user_history` | `reservations` | `(user_id, status, start_at DESC)` | Speeds up Student and Admin booking history dashboard queries. |
| `idx_reservations_start_end` | `reservations` | `(start_at, end_at)` | Facilitates campus-wide calendar views and peak-hour reports. |
| `idx_waitlist_resource_fk` | `waitlist_entries` | `(resource_id)` | Foreign key lookups on resources. |
| `idx_waitlist_queue` | `waitlist_entries` | `(resource_id, status, priority_level ASC, joined_at ASC)` | **Priority Waitlist Processing**: Index-driven scan for highest priority (P1) and earliest joined waiting entry. |
| `idx_waitlist_user_status` | `waitlist_entries` | `(user_id, status)` | Fast lookup for student dashboard listing active waitlist entries. |
| `idx_history_reservation_time` | `reservation_status_history` | `(reservation_id, changed_at ASC)` | Chronological audit log retrieval. |

---

### 6. Database Roles & Least-Privilege Access Control

MySQL 8 database roles are implemented in [`db/roles.sql`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/db/roles.sql):

1. **`campus_student_role`**:
   - `SELECT` on `resources`.
   - `SELECT, INSERT` and restricted column `UPDATE (status, cancelled_at, purpose)` on `reservations`.
   - `SELECT, INSERT` and restricted column `UPDATE (status, requested_start_at, requested_end_at)` on `waitlist_entries`.
   - `SELECT, INSERT` on `reservation_status_history`.
   - **Column-level security**: `SELECT` on `users` is restricted to `(id, full_name, email, role, is_active)`. Access to `password_hash` is explicitly denied.
   - `DELETE` commands are denied across all main tables.
   - In Phase 3, row-level ownership validation (preventing Student A from modifying Student B's reservation) is enforced via Stored Procedures.
2. **`campus_admin_role`**:
   - Full management (`SELECT, INSERT, UPDATE, DELETE`) on `resources`, `reservations`, `waitlist_entries`, and `reservation_status_history`.
   - `SELECT, INSERT, UPDATE` on `users`.
3. **`campus_auth_role`**:
   - Restricted to `SELECT, INSERT`, and `UPDATE` on credential management columns of `users`.

---

### 7. Local Demo Accounts & Seed Data

Populated via reproducible script [`scripts/seed.mjs`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/scripts/seed.mjs):

| Role | Name | Email | Password |
|---|---|---|---|
| **ADMIN** | Prof. Ramesh Sharma | `admin.ramesh@campus.edu` | `Admin@1234` |
| **STUDENT** | Aarav Patel | `aarav.patel@student.campus.edu` | `Student@1234` |
| **STUDENT** | Diya Sengupta | `diya.sengupta@student.campus.edu` | `Student@1234` |
| **STUDENT** | Kavya Nair | `kavya.nair@student.campus.edu` | `Student@1234` |
| **STUDENT** | Rohan Verma | `rohan.verma@student.campus.edu` | `Student@1234` |

---

### 8. Test Automation & Verification

Automated test suite: [`scripts/test-phase2.mjs`](file:///Users/KaustubhAkash/Desktop/labs/DBMS_MINIPROJECT/scripts/test-phase2.mjs).

Run test suite:
```bash
node scripts/test-phase2.mjs
```

All 14 tests pass, verifying:
- Schema existence
- Primary key rejection
- Unique email rejection
- Foreign key rejection
- CHECK constraints (Capacity, Interval, Role, Priority range)
- Duplicate active waitlist rejection
- Historical waitlist retention (NULL active key)
- Waitlist Priority Policy (1=highest, ASC order)
- Audit history retention (`ON DELETE RESTRICT`)
- Timezone consistency (Asia/Kolkata literal preservation without UTC drift)
- Database role security and column-level access control
