/**
 * Phase 2 Relational Database Test Suite
 * File: scripts/test-phase2.mjs
 * 
 * Verifies all Phase 2 and Pre-Phase 3 requirements:
 * - PASS: expected operation succeeded
 * - PASS: invalid operation was correctly rejected (constraint enforcement)
 * - FAIL: unexpected result
 * - NOT VERIFIED: test could not be executed
 * 
 * Does NOT corrupt or mutate actual seed data.
 */

import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus_reserve',
  decimalNumbers: true,
  dateStrings: true,
  timezone: '+05:30',
};

const results = [];

function recordResult(testName, status, details) {
  results.push({ testName, status, details });
  const icon = status.startsWith('PASS') ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${testName}`);
  if (details) {
    console.log(`   └─ ${details}`);
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('   CAMPUS RESERVE: PHASE 2 TEST VERIFICATION SUITE');
  console.log('============================================================\n');

  const conn = await mysql.createConnection(dbConfig);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Schema Existence & Integrity
    // ------------------------------------------------------------------------
    const expectedTables = ['users', 'resources', 'reservations', 'waitlist_entries', 'reservation_status_history'];
    const [tableRows] = await conn.execute('SHOW TABLES');
    const existingTables = tableRows.map((r) => Object.values(r)[0]);
    const missingTables = expectedTables.filter((t) => !existingTables.includes(t));

    if (missingTables.length === 0) {
      recordResult('Schema Existence (5 required tables)', 'PASS: expected operation succeeded', `Found: ${existingTables.join(', ')}`);
    } else {
      recordResult('Schema Existence', 'FAIL', `Missing tables: ${missingTables.join(', ')}`);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Primary Key Duplication Rejection
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO users (id, full_name, email, password_hash, role)
         VALUES (1, 'Duplicate PK Test', 'test_pk_unique@campus.edu', 'hash', 'STUDENT')`
      );
      recordResult('Primary Key Constraint', 'FAIL', 'Inserted duplicate ID=1 without error');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        recordResult('Primary Key Constraint', 'PASS: invalid operation was correctly rejected', 'ER_DUP_ENTRY duplicate ID rejected');
      } else {
        recordResult('Primary Key Constraint', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 3: Unique Email Constraint Rejection
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ('Duplicate Email User', 'admin.ramesh@campus.edu', 'hash', 'STUDENT')`
      );
      recordResult('Unique Email Constraint', 'FAIL', 'Inserted duplicate email without error');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        recordResult('Unique Email Constraint', 'PASS: invalid operation was correctly rejected', 'ER_DUP_ENTRY duplicate email rejected');
      } else {
        recordResult('Unique Email Constraint', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 4: Foreign Key Rejection on Invalid User ID
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
         VALUES (999999, 1, '2026-11-20 10:00:00', '2026-11-20 11:00:00', 'Invalid FK test', 'CONFIRMED')`
      );
      recordResult('Foreign Key Constraint (user_id)', 'FAIL', 'Inserted reservation with non-existent user_id');
    } catch (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        recordResult('Foreign Key Constraint (user_id)', 'PASS: invalid operation was correctly rejected', 'ER_NO_REFERENCED_ROW_2 rejected non-existent user_id');
      } else {
        recordResult('Foreign Key Constraint (user_id)', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 5: CHECK Constraint: Invalid Resource Capacity (capacity <= 0)
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO resources (name, resource_type, building, floor, room_number, capacity)
         VALUES ('Test Zero Cap', 'CLASSROOM', 'Bldg', 1, '101', 0)`
      );
      recordResult('CHECK Constraint: Resource Capacity > 0', 'FAIL', 'Inserted resource with capacity=0');
    } catch (err) {
      if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        recordResult('CHECK Constraint: Resource Capacity > 0', 'PASS: invalid operation was correctly rejected', 'chk_resources_capacity correctly violated');
      } else {
        recordResult('CHECK Constraint: Resource Capacity > 0', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 6: CHECK Constraint: Invalid Reservation Interval (end_at <= start_at)
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
         VALUES (2, 1, '2026-11-20 12:00:00', '2026-11-20 10:00:00', 'Backwards time test', 'CONFIRMED')`
      );
      recordResult('CHECK Constraint: Reservation Interval (end_at > start_at)', 'FAIL', 'Inserted reservation with end_at <= start_at');
    } catch (err) {
      if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        recordResult('CHECK Constraint: Reservation Interval (end_at > start_at)', 'PASS: invalid operation was correctly rejected', 'chk_reservations_interval correctly violated');
      } else {
        recordResult('CHECK Constraint: Reservation Interval (end_at > start_at)', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 7: CHECK Constraint: Invalid User Role
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ('Superuser', 'superuser_invalid@campus.edu', 'hash', 'SUPERADMIN')`
      );
      recordResult('CHECK/ENUM Constraint: User Role', 'FAIL', 'Inserted invalid role');
    } catch (err) {
      if (err.code === 'WARN_DATA_TRUNCATED' || err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        recordResult('CHECK/ENUM Constraint: User Role', 'PASS: invalid operation was correctly rejected', 'Invalid role SUPERADMIN rejected');
      } else {
        recordResult('CHECK/ENUM Constraint: User Role', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 8: CHECK Constraint: Waitlist Priority Range (1 to 10)
    // ------------------------------------------------------------------------
    try {
      await conn.execute(
        `INSERT INTO waitlist_entries (user_id, resource_id, requested_start_at, requested_end_at, priority_level, status)
         VALUES (2, 1, '2026-11-25 10:00:00', '2026-11-25 11:00:00', 99, 'WAITING')`
      );
      recordResult('CHECK Constraint: Waitlist Priority (1-10)', 'FAIL', 'Inserted priority_level=99');
    } catch (err) {
      if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
        recordResult('CHECK Constraint: Waitlist Priority (1-10)', 'PASS: invalid operation was correctly rejected', 'chk_waitlist_priority correctly violated');
      } else {
        recordResult('CHECK Constraint: Waitlist Priority (1-10)', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 9: Duplicate Active Waitlist Request Rejection
    // ------------------------------------------------------------------------
    // Get an existing active waitlist entry
    const [activeWl] = await conn.execute(
      `SELECT user_id, resource_id, requested_start_at, requested_end_at 
       FROM waitlist_entries WHERE status = 'WAITING' LIMIT 1`
    );

    if (activeWl.length > 0) {
      const entry = activeWl[0];
      try {
        await conn.execute(
          `INSERT INTO waitlist_entries (user_id, resource_id, requested_start_at, requested_end_at, priority_level, status)
           VALUES (?, ?, ?, ?, 1, 'WAITING')`,
          [entry.user_id, entry.resource_id, entry.requested_start_at, entry.requested_end_at]
        );
        recordResult('Duplicate Active Waitlist Rejection', 'FAIL', 'Inserted duplicate active waitlist entry');
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          recordResult('Duplicate Active Waitlist Rejection', 'PASS: invalid operation was correctly rejected', 'uq_waitlist_active_request generated key rejected duplicate active request');
        } else {
          recordResult('Duplicate Active Waitlist Rejection', 'FAIL', `Unexpected error: ${err.message}`);
        }
      }
    } else {
      recordResult('Duplicate Active Waitlist Rejection', 'NOT VERIFIED', 'No active waitlist entries found in database');
    }

    // ------------------------------------------------------------------------
    // TEST 10: Historical Waitlist Retention (Non-waiting records allowed)
    // ------------------------------------------------------------------------
    let testHistoryId = null;
    try {
      const [res] = await conn.execute(
        `INSERT INTO waitlist_entries (user_id, resource_id, requested_start_at, requested_end_at, priority_level, status)
         VALUES (2, 1, '2026-11-28 10:00:00', '2026-11-28 12:00:00', 3, 'CANCELLED')`
      );
      testHistoryId = res.insertId;

      const [check] = await conn.execute(
        `SELECT id, status, active_waitlist_key FROM waitlist_entries WHERE id = ?`,
        [testHistoryId]
      );

      if (check.length > 0 && check[0].active_waitlist_key === null) {
        recordResult('Historical Waitlist Retention', 'PASS: expected operation succeeded', 'CANCELLED status yields active_waitlist_key=NULL, preserving history');
      } else {
        recordResult('Historical Waitlist Retention', 'FAIL', `active_waitlist_key not NULL: ${JSON.stringify(check[0])}`);
      }
    } catch (err) {
      recordResult('Historical Waitlist Retention', 'FAIL', err.message);
    } finally {
      if (testHistoryId) {
        await conn.execute('DELETE FROM waitlist_entries WHERE id = ?', [testHistoryId]);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 11: Waitlist Priority Ordering (ASC: 1=highest, earlier joined_at wins)
    // ------------------------------------------------------------------------
    const [orderedWl] = await conn.execute(
      `SELECT id, resource_id, priority_level, joined_at 
       FROM waitlist_entries 
       WHERE resource_id = 1 AND status = 'WAITING' 
       ORDER BY priority_level ASC, joined_at ASC`
    );

    let orderingCorrect = true;
    for (let i = 0; i < orderedWl.length - 1; i++) {
      const curr = orderedWl[i];
      const next = orderedWl[i + 1];
      if (curr.priority_level > next.priority_level) {
        orderingCorrect = false;
        break;
      }
      if (curr.priority_level === next.priority_level && curr.joined_at > next.joined_at) {
        orderingCorrect = false;
        break;
      }
    }

    if (orderedWl.length >= 2 && orderingCorrect) {
      recordResult(
        'Waitlist Priority Policy (1=highest, ASC order)',
        'PASS: expected operation succeeded',
        `Correct queue: ${orderedWl.map((r) => `[ID ${r.id}: P${r.priority_level}]`).join(' -> ')}`
      );
    } else {
      recordResult('Waitlist Priority Policy', 'FAIL', 'Waitlist entries not ordered with 1 as highest');
    }

    // ------------------------------------------------------------------------
    // TEST 12: Audit History Retention: Prevent Direct Deletion of Reservation
    // ------------------------------------------------------------------------
    try {
      await conn.execute('DELETE FROM reservations WHERE id = 1');
      recordResult('Audit History Integrity (ON DELETE RESTRICT on reservations)', 'FAIL', 'Reservation with audit history was deleted');
    } catch (err) {
      if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        recordResult(
          'Audit History Integrity (ON DELETE RESTRICT on reservations)',
          'PASS: invalid operation was correctly rejected',
          'ER_ROW_IS_REFERENCED_2: cannot delete reservation with existing audit history'
        );
      } else {
        recordResult('Audit History Integrity', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 13: Timezone Consistency (Asia/Kolkata IST)
    // ------------------------------------------------------------------------
    const [tzRows] = await conn.execute(`SELECT @@time_zone AS session_tz, @@system_time_zone AS sys_tz`);
    const [sampleDates] = await conn.execute(`SELECT start_at, end_at FROM reservations WHERE id = 1`);
    const dateRow = sampleDates[0];

    // Verify raw date string matches literal format without UTC shift
    if (dateRow.start_at === '2026-11-10 09:00:00' && dateRow.end_at === '2026-11-10 11:30:00') {
      recordResult(
        'Timezone Consistency (Asia/Kolkata literal preservation)',
        'PASS: expected operation succeeded',
        `System TZ: ${tzRows[0].sys_tz}, Returned literal: "${dateRow.start_at}" to "${dateRow.end_at}" without drift`
      );
    } else {
      recordResult(
        'Timezone Consistency',
        'FAIL',
        `Date values drifted: start_at=${dateRow.start_at}, end_at=${dateRow.end_at}`
      );
    }

    // ------------------------------------------------------------------------
    // TEST 14: MySQL Roles & Privileges (Student restricted, Admin full)
    // ------------------------------------------------------------------------
    try {
      // Create a temporary user with student role
      await conn.execute(`DROP USER IF EXISTS 'test_suite_student'@'localhost'`);
      await conn.execute(`CREATE USER 'test_suite_student'@'localhost' IDENTIFIED BY 'SuiteTestPass123!'`);
      await conn.execute(`GRANT 'campus_student_role' TO 'test_suite_student'@'localhost'`);
      await conn.execute(`SET DEFAULT ROLE 'campus_student_role' TO 'test_suite_student'@'localhost'`);
      await conn.execute(`FLUSH PRIVILEGES`);

      // Connect as student
      const studentConn = await mysql.createConnection({
        host: 'localhost',
        user: 'test_suite_student',
        password: 'SuiteTestPass123!',
        database: 'campus_reserve',
      });

      // 14.1 Student can read resources
      const [resList] = await studentConn.execute('SELECT id, name FROM resources LIMIT 1');
      const studentCanReadResources = resList.length > 0;

      // 14.2 Student CANNOT delete resources
      let studentDeleteRejected = false;
      try {
        await studentConn.execute('DELETE FROM resources WHERE id = 1');
      } catch (err) {
        if (err.code === 'ER_TABLEACCESS_DENIED_ERROR') {
          studentDeleteRejected = true;
        }
      }

      // 14.3 Student CANNOT read password hashes
      let studentPasswordDenied = false;
      try {
        await studentConn.execute('SELECT id, email, password_hash FROM users LIMIT 1');
      } catch (err) {
        if (err.code === 'ER_COLUMNACCESS_DENIED_ERROR') {
          studentPasswordDenied = true;
        }
      }

      await studentConn.end();

      if (studentCanReadResources && studentDeleteRejected && studentPasswordDenied) {
        recordResult(
          'MySQL Role Security (campus_student_role)',
          'PASS: expected operation succeeded',
          'Resources readable, Resource deletion DENIED, password_hash access DENIED'
        );
      } else {
        recordResult(
          'MySQL Role Security (campus_student_role)',
          'FAIL',
          `Read: ${studentCanReadResources}, Delete rejected: ${studentDeleteRejected}, Password denied: ${studentPasswordDenied}`
        );
      }
    } catch (err) {
      recordResult('MySQL Role Security', 'FAIL', err.message);
    } finally {
      await conn.execute(`DROP USER IF EXISTS 'test_suite_student'@'localhost'`);
    }

  } catch (err) {
    console.error('Fatal test suite error:', err);
  } finally {
    await conn.end();
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  const passCount = results.filter((r) => r.status.startsWith('PASS')).length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const notVerifiedCount = results.filter((r) => r.status === 'NOT VERIFIED').length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount} | NOT VERIFIED: ${notVerifiedCount}`);
  console.log('------------------------------------------------------------\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
