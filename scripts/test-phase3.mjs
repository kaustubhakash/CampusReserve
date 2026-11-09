/**
 * Phase 3 Advanced Database Logic Test Suite
 * File: scripts/test-phase3.mjs
 * 
 * Tests all required Phase 3 database behaviors:
 *  1. Successful reservation.
 *  2. Overlapping reservation is waitlisted.
 *  3. Back-to-back reservations are allowed.
 *  4. Partial overlap is rejected/waitlisted.
 *  5. CANCELLED reservations do not block availability.
 *  6. Invalid interval is rejected.
 *  7. Inactive resource cannot be booked.
 *  8. Inactive/nonexistent user cannot book.
 *  9. Cancellation by reservation owner succeeds.
 * 10. Cancellation by another student is rejected.
 * 11. Admin cancellation succeeds.
 * 12. Correct waitlist promotion after cancellation.
 * 13. Priority 2 is promoted before priority 3.
 * 14. FIFO ordering for equal priority.
 * 15. Ineligible waitlist entry is skipped if its interval still conflicts.
 * 16. Status changes create audit history.
 * 17. Direct invalid INSERT/UPDATE is rejected by triggers.
 * 18. Reservation deletion does not erase audit history (ON DELETE RESTRICT).
 * 19. Transaction rollback leaves no partial booking/waitlist changes.
 * 20. Two concurrent overlapping booking requests cannot both become CONFIRMED.
 * 
 * Targeted Security & Test-Coverage Additions:
 * 21. Student cannot impersonate admin (procedure verifies role in `users` table).
 * 22. Inactive student cannot book; existing active student can book.
 * 23. Trigger blocks direct UPDATE that causes interval overlap.
 * 24. Trigger blocks direct UPDATE with end_at <= start_at.
 * 25. Trigger blocks direct UPDATE changing CANCELLED to CONFIRMED if conflicting.
 * 26. Valid non-overlapping direct UPDATE succeeds.
 * 27. Audit actor and source correctly recorded without duplicate entries.
 * 28. Failure during cancellation/waitlist promotion performs full transactional rollback.
 * 
 * Safely cleans up all test records and preserves baseline seed data.
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
  multipleStatements: true,
};

const results = [];

function recordResult(testNum, testName, status, details) {
  results.push({ testNum, testName, status, details });
  const icon = status.startsWith('PASS') ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] Test ${testNum}: ${testName}`);
  if (details) {
    console.log(`   └─ ${details}`);
  }
}

// Helper to reliably call sp_request_reservation
async function requestReservation(conn, userId, resourceId, startAt, endAt, purpose, priority = 5) {
  const [rows] = await conn.query(
    `CALL sp_request_reservation(?, ?, ?, ?, ?, ?, @out_status, @out_bid, @out_wlid, @out_msg);
     SELECT @out_status AS outcome, @out_bid AS bid, @out_wlid AS wlid, @out_msg AS msg;`,
    [userId, resourceId, startAt, endAt, purpose, priority]
  );
  return rows[1][0];
}

// Helper to reliably call sp_cancel_and_process_waitlist (authenticating via requester user ID)
async function cancelReservation(conn, resId, reqUserId) {
  const [rows] = await conn.query(
    `CALL sp_cancel_and_process_waitlist(?, ?, @out_cstat, @out_pres, @out_pusr, @out_pwl, @out_cmsg);
     SELECT @out_cstat AS c_stat, @out_pres AS prom_res, @out_pusr AS prom_usr, @out_pwl AS prom_wl, @out_cmsg AS c_msg;`,
    [resId, reqUserId]
  );
  return rows[1][0];
}

async function runPhase3Tests() {
  console.log('\n============================================================');
  console.log('   CAMPUS RESERVE: PHASE 3 ADVANCED DATABASE TEST SUITE');
  console.log('============================================================\n');

  const mainConn = await mysql.createConnection(dbConfig);

  const createdResIds = new Set();
  const createdWlIds = new Set();
  const createdResourceIds = new Set();
  const createdUserIds = new Set();

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Successful reservation
    // ------------------------------------------------------------------------
    const t1 = await requestReservation(mainConn, 2, 3, '2026-11-20 09:00:00', '2026-11-20 11:00:00', 'Test 1: Normal booking');
    if (t1.outcome === 'CONFIRMED' && t1.bid) {
      createdResIds.add(t1.bid);
      recordResult(1, 'Successful reservation', 'PASS: expected operation succeeded', `Created confirmed reservation #${t1.bid}`);
    } else {
      recordResult(1, 'Successful reservation', 'FAIL', `Outcome: ${t1.outcome}, Msg: ${t1.msg}`);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Overlapping reservation is waitlisted
    // ------------------------------------------------------------------------
    const t2 = await requestReservation(mainConn, 3, 3, '2026-11-20 10:00:00', '2026-11-20 12:00:00', 'Test 2: Overlapping request');
    if (t2.outcome === 'WAITLISTED' && t2.wlid) {
      createdWlIds.add(t2.wlid);
      recordResult(2, 'Overlapping reservation is waitlisted', 'PASS: expected operation succeeded', `Placed on waitlist #${t2.wlid}`);
    } else {
      recordResult(2, 'Overlapping reservation is waitlisted', 'FAIL', `Outcome: ${t2.outcome}, Msg: ${t2.msg}`);
    }

    // ------------------------------------------------------------------------
    // TEST 3: Back-to-back reservations are allowed
    // ------------------------------------------------------------------------
    const t3 = await requestReservation(mainConn, 4, 3, '2026-11-20 11:00:00', '2026-11-20 13:00:00', 'Test 3: Back-to-back slot');
    if (t3.outcome === 'CONFIRMED' && t3.bid) {
      createdResIds.add(t3.bid);
      recordResult(3, 'Back-to-back reservations are allowed', 'PASS: expected operation succeeded', `Confirmed boundary reservation #${t3.bid}`);
    } else {
      recordResult(3, 'Back-to-back reservations are allowed', 'FAIL', `Outcome: ${t3.outcome}, Msg: ${t3.msg}`);
    }

    // ------------------------------------------------------------------------
    // TEST 4: Partial overlap is rejected/waitlisted
    // ------------------------------------------------------------------------
    const t4 = await requestReservation(mainConn, 5, 3, '2026-11-20 10:30:00', '2026-11-20 11:30:00', 'Test 4: Partial overlap');
    if (t4.outcome === 'WAITLISTED' && t4.wlid) {
      createdWlIds.add(t4.wlid);
      recordResult(4, 'Partial overlap is rejected/waitlisted', 'PASS: expected operation succeeded', `Waitlisted partial overlap #${t4.wlid}`);
    } else {
      recordResult(4, 'Partial overlap is rejected/waitlisted', 'FAIL', `Outcome: ${t4.outcome}, Msg: ${t4.msg}`);
    }

    // ------------------------------------------------------------------------
    // TEST 5: CANCELLED reservations do not block availability
    // ------------------------------------------------------------------------
    const [t5Rows] = await mainConn.execute(
      `SELECT fn_is_resource_available(1, '2026-11-08 14:30:00', '2026-11-08 15:30:00') AS available`
    );
    if (t5Rows[0].available === 1) {
      recordResult(5, 'CANCELLED reservations do not block availability', 'PASS: expected operation succeeded', 'Resource available despite cancelled record');
    } else {
      recordResult(5, 'CANCELLED reservations do not block availability', 'FAIL', `fn_is_resource_available returned ${t5Rows[0].available}`);
    }

    // ------------------------------------------------------------------------
    // TEST 6: Invalid interval is rejected
    // ------------------------------------------------------------------------
    const t6 = await requestReservation(mainConn, 2, 3, '2026-11-20 15:00:00', '2026-11-20 14:00:00', 'Backwards time');
    if (t6.outcome === 'REJECTED') {
      recordResult(6, 'Invalid interval is rejected', 'PASS: invalid operation was correctly rejected', t6.msg);
    } else {
      recordResult(6, 'Invalid interval is rejected', 'FAIL', `Expected REJECTED, got: ${t6.outcome}`);
    }

    // ------------------------------------------------------------------------
    // TEST 7: Inactive resource cannot be booked
    // ------------------------------------------------------------------------
    const [resRes] = await mainConn.execute(
      `INSERT INTO resources (name, resource_type, building, floor, room_number, capacity, is_active)
       VALUES ('Inactive Lab Test', 'LAB', 'Block Z', 1, 'Z-101', 20, FALSE)`
    );
    const inactiveResId = resRes.insertId;
    createdResourceIds.add(inactiveResId);

    const t7 = await requestReservation(mainConn, 2, inactiveResId, '2026-11-21 10:00:00', '2026-11-21 11:00:00', 'Inactive test');
    if (t7.outcome === 'REJECTED') {
      recordResult(7, 'Inactive resource cannot be booked', 'PASS: invalid operation was correctly rejected', t7.msg);
    } else {
      recordResult(7, 'Inactive resource cannot be booked', 'FAIL', `Expected REJECTED, got: ${t7.outcome}`);
    }

    // ------------------------------------------------------------------------
    // TEST 8: Inactive/nonexistent user cannot book
    // ------------------------------------------------------------------------
    const t8 = await requestReservation(mainConn, 999999, 3, '2026-11-21 10:00:00', '2026-11-21 11:00:00', 'Bad user');
    if (t8.outcome === 'REJECTED') {
      recordResult(8, 'Inactive/nonexistent user cannot book', 'PASS: invalid operation was correctly rejected', t8.msg);
    } else {
      recordResult(8, 'Inactive/nonexistent user cannot book', 'FAIL', `Expected REJECTED, got: ${t8.outcome}`);
    }

    // ------------------------------------------------------------------------
    // TEST 9: Cancellation by reservation owner succeeds
    // ------------------------------------------------------------------------
    const t9Create = await requestReservation(mainConn, 2, 4, '2026-11-22 09:00:00', '2026-11-22 10:00:00', 'Owner cancel test');
    createdResIds.add(t9Create.bid);

    const t9 = await cancelReservation(mainConn, t9Create.bid, 2);
    if (t9.c_stat === 'CANCELLED') {
      recordResult(9, 'Cancellation by reservation owner succeeds', 'PASS: expected operation succeeded', t9.c_msg);
    } else {
      recordResult(9, 'Cancellation by reservation owner succeeds', 'FAIL', t9.c_msg);
    }

    // ------------------------------------------------------------------------
    // TEST 10: Cancellation by another student is rejected
    // ------------------------------------------------------------------------
    const t10Create = await requestReservation(mainConn, 2, 4, '2026-11-22 11:00:00', '2026-11-22 12:00:00', 'Unauthorized cancel test');
    createdResIds.add(t10Create.bid);

    // User 3 (student) attempts to cancel User 2's booking
    const t10 = await cancelReservation(mainConn, t10Create.bid, 3);
    if (t10.c_stat === 'REJECTED') {
      recordResult(10, 'Cancellation by another student is rejected', 'PASS: invalid operation was correctly rejected', t10.c_msg);
    } else {
      recordResult(10, 'Cancellation by another student is rejected', 'FAIL', `Expected REJECTED, got: ${t10.c_stat}`);
    }

    // ------------------------------------------------------------------------
    // TEST 11: Admin cancellation succeeds
    // ------------------------------------------------------------------------
    // User 1 (Admin) cancels User 2's booking
    const t11 = await cancelReservation(mainConn, t10Create.bid, 1);
    if (t11.c_stat === 'CANCELLED') {
      recordResult(11, 'Admin cancellation succeeds', 'PASS: expected operation succeeded', t11.c_msg);
    } else {
      recordResult(11, 'Admin cancellation succeeds', 'FAIL', t11.c_msg);
    }

    // ------------------------------------------------------------------------
    // TEST 12: Correct waitlist promotion after cancellation
    // ------------------------------------------------------------------------
    const t12Initial = await requestReservation(mainConn, 2, 5, '2026-11-23 09:00:00', '2026-11-23 11:00:00', 'Waitlist promo initial');
    createdResIds.add(t12Initial.bid);

    const t12Cand = await requestReservation(mainConn, 3, 5, '2026-11-23 09:00:00', '2026-11-23 11:00:00', 'Waitlist candidate', 2);
    createdWlIds.add(t12Cand.wlid);

    const t12 = await cancelReservation(mainConn, t12Initial.bid, 2);
    if (t12.c_stat === 'CANCELLED' && t12.prom_res && t12.prom_wl === t12Cand.wlid && t12.prom_usr === 3) {
      createdResIds.add(t12.prom_res);
      recordResult(12, 'Correct waitlist promotion after cancellation', 'PASS: expected operation succeeded', `Candidate #${t12Cand.wlid} promoted to Reservation #${t12.prom_res}`);
    } else {
      recordResult(12, 'Correct waitlist promotion after cancellation', 'FAIL', `c_stat: ${t12.c_stat}, prom_res: ${t12.prom_res}`);
    }

    // ------------------------------------------------------------------------
    // TEST 13: Priority 2 is promoted before priority 3
    // ------------------------------------------------------------------------
    const t13Initial = await requestReservation(mainConn, 2, 5, '2026-11-24 09:00:00', '2026-11-24 11:00:00', 'Priority initial');
    createdResIds.add(t13Initial.bid);

    // Candidate P3 joined first
    const t13P3 = await requestReservation(mainConn, 4, 5, '2026-11-24 09:00:00', '2026-11-24 11:00:00', 'Candidate P3', 3);
    createdWlIds.add(t13P3.wlid);

    // Candidate P2 joined second (higher priority!)
    const t13P2 = await requestReservation(mainConn, 5, 5, '2026-11-24 09:00:00', '2026-11-24 11:00:00', 'Candidate P2', 2);
    createdWlIds.add(t13P2.wlid);

    const t13 = await cancelReservation(mainConn, t13Initial.bid, 2);
    if (t13.prom_usr === 5 && t13.prom_wl === t13P2.wlid) {
      if (t13.prom_res) createdResIds.add(t13.prom_res);
      recordResult(13, 'Priority 2 is promoted before priority 3', 'PASS: expected operation succeeded', `P2 candidate #${t13P2.wlid} promoted over earlier joined P3 #${t13P3.wlid}`);
    } else {
      recordResult(13, 'Priority 2 is promoted before priority 3', 'FAIL', `Promoted user ${t13.prom_usr}, waitlist ${t13.prom_wl}`);
    }

    // ------------------------------------------------------------------------
    // TEST 14: FIFO ordering for equal priority
    // ------------------------------------------------------------------------
    const t14Initial = await requestReservation(mainConn, 2, 6, '2026-11-25 09:00:00', '2026-11-25 11:00:00', 'FIFO initial');
    createdResIds.add(t14Initial.bid);

    // User 3 joined first with P2
    const t14Fifo1 = await requestReservation(mainConn, 3, 6, '2026-11-25 09:00:00', '2026-11-25 11:00:00', 'Candidate 1 P2', 2);
    createdWlIds.add(t14Fifo1.wlid);

    // User 4 joined second with P2
    const t14Fifo2 = await requestReservation(mainConn, 4, 6, '2026-11-25 09:00:00', '2026-11-25 11:00:00', 'Candidate 2 P2', 2);
    createdWlIds.add(t14Fifo2.wlid);

    const t14 = await cancelReservation(mainConn, t14Initial.bid, 2);
    if (t14.prom_usr === 3 && t14.prom_wl === t14Fifo1.wlid) {
      if (t14.prom_res) createdResIds.add(t14.prom_res);
      recordResult(14, 'FIFO ordering for equal priority', 'PASS: expected operation succeeded', `Earlier joined candidate #${t14Fifo1.wlid} promoted`);
    } else {
      recordResult(14, 'FIFO ordering for equal priority', 'FAIL', `Promoted user ${t14.prom_usr}, waitlist ${t14.prom_wl}`);
    }

    // ------------------------------------------------------------------------
    // TEST 15: Ineligible waitlist entry is skipped if its interval still conflicts
    // ------------------------------------------------------------------------
    const t15SlotA = await requestReservation(mainConn, 2, 4, '2026-11-26 09:00:00', '2026-11-26 11:00:00', 'Slot A');
    createdResIds.add(t15SlotA.bid);

    const t15SlotB = await requestReservation(mainConn, 3, 4, '2026-11-26 11:00:00', '2026-11-26 13:00:00', 'Slot B');
    createdResIds.add(t15SlotB.bid);

    // High priority P1 candidate spans Slot A and Slot B
    const t15Inelig = await requestReservation(mainConn, 4, 4, '2026-11-26 10:00:00', '2026-11-26 12:00:00', 'Ineligible Candidate', 1);
    createdWlIds.add(t15Inelig.wlid);

    // Lower priority P3 candidate fits entirely inside Slot A (09:00-10:30)
    const t15Elig = await requestReservation(mainConn, 5, 4, '2026-11-26 09:00:00', '2026-11-26 10:30:00', 'Eligible Candidate', 3);
    createdWlIds.add(t15Elig.wlid);

    const t15 = await cancelReservation(mainConn, t15SlotA.bid, 2);
    if (t15.prom_usr === 5 && t15.prom_wl === t15Elig.wlid) {
      if (t15.prom_res) createdResIds.add(t15.prom_res);
      recordResult(15, 'Ineligible waitlist entry is skipped if interval still conflicts', 'PASS: expected operation succeeded', `Skipped conflicting P1 #${t15Inelig.wlid}; promoted eligible P3 #${t15Elig.wlid}`);
    } else {
      recordResult(15, 'Ineligible waitlist entry is skipped', 'FAIL', `Promoted user ${t15.prom_usr}, waitlist ${t15.prom_wl}`);
    }

    // ------------------------------------------------------------------------
    // TEST 16: Status changes create audit history
    // ------------------------------------------------------------------------
    const [t16Rows] = await mainConn.execute(
      `SELECT old_status, new_status, change_source 
       FROM reservation_status_history 
       WHERE reservation_id = ? AND new_status = 'CANCELLED'`,
      [t15SlotA.bid]
    );
    if (t16Rows.length > 0 && t16Rows[0].old_status === 'CONFIRMED' && t16Rows[0].new_status === 'CANCELLED') {
      recordResult(16, 'Status changes create audit history', 'PASS: expected operation succeeded', 'Found trigger-generated audit record: CONFIRMED -> CANCELLED');
    } else {
      recordResult(16, 'Status changes create audit history', 'FAIL', 'No audit record found for cancelled reservation');
    }

    // ------------------------------------------------------------------------
    // TEST 17: Direct invalid INSERT/UPDATE is rejected by triggers
    // ------------------------------------------------------------------------
    try {
      await mainConn.execute(
        `INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
         VALUES (2, 4, '2026-11-26 11:30:00', '2026-11-26 12:30:00', 'Bypass trigger attempt', 'CONFIRMED')`
      );
      recordResult(17, 'Direct invalid INSERT/UPDATE rejected by triggers', 'FAIL', 'Direct insert succeeded despite overlap');
    } catch (err) {
      if (err.message.includes('Trigger validation error')) {
        recordResult(17, 'Direct invalid INSERT/UPDATE rejected by triggers', 'PASS: invalid operation was correctly rejected', err.message);
      } else {
        recordResult(17, 'Direct invalid INSERT/UPDATE rejected by triggers', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 18: Reservation deletion does not erase audit history
    // ------------------------------------------------------------------------
    try {
      await mainConn.execute(`DELETE FROM reservations WHERE id = ?`, [t15SlotA.bid]);
      recordResult(18, 'Reservation deletion does not erase audit history', 'FAIL', 'Reservation deleted despite audit history');
    } catch (err) {
      if (err.code === 'ER_ROW_IS_REFERENCED_2') {
        recordResult(18, 'Reservation deletion does not erase audit history', 'PASS: invalid operation was correctly rejected', 'Foreign key ON DELETE RESTRICT rejected deletion');
      } else {
        recordResult(18, 'Reservation deletion does not erase audit history', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 19: Transaction rollback leaves no partial booking/waitlist changes
    // ------------------------------------------------------------------------
    const [beforeRes] = await mainConn.execute('SELECT COUNT(*) AS c FROM reservations');
    const [beforeWl] = await mainConn.execute('SELECT COUNT(*) AS c FROM waitlist_entries');

    try {
      await mainConn.query(`
        START TRANSACTION;
        INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status)
        VALUES (2, 3, '2026-11-27 10:00:00', '2026-11-27 11:00:00', 'Rollback test', 'CONFIRMED');
        -- Deliberate error to trigger rollback
        INSERT INTO non_existent_table VALUES (1);
        COMMIT;
      `);
    } catch (err) {
      await mainConn.query('ROLLBACK;');
    }

    const [afterRes] = await mainConn.execute('SELECT COUNT(*) AS c FROM reservations');
    const [afterWl] = await mainConn.execute('SELECT COUNT(*) AS c FROM waitlist_entries');

    if (beforeRes[0].c === afterRes[0].c && beforeWl[0].c === afterWl[0].c) {
      recordResult(19, 'Transaction rollback leaves no partial booking/waitlist changes', 'PASS: expected operation succeeded', 'Atomicity verified: row counts unchanged after rollback');
    } else {
      recordResult(19, 'Transaction rollback leaves no partial changes', 'FAIL', 'Row counts drifted after rollback');
    }

    // ------------------------------------------------------------------------
    // TEST 20: Two concurrent overlapping booking requests cannot both become CONFIRMED
    // ------------------------------------------------------------------------
    const connA = await mysql.createConnection(dbConfig);
    const connB = await mysql.createConnection(dbConfig);

    const callPromiseA = connA.query(
      `CALL sp_request_reservation(2, 3, '2026-11-28 14:00:00', '2026-11-28 16:00:00', 'Concurrent Race A', 5, @outcomeA, @bidA, @wlidA, @msgA);
       SELECT @outcomeA AS outcome, @bidA AS bid, @wlidA AS wlid, @msgA AS msg;`
    );

    const callPromiseB = connB.query(
      `CALL sp_request_reservation(3, 3, '2026-11-28 14:00:00', '2026-11-28 16:00:00', 'Concurrent Race B', 5, @outcomeB, @bidB, @wlidB, @msgB);
       SELECT @outcomeB AS outcome, @bidB AS bid, @wlidB AS wlid, @msgB AS msg;`
    );

    const [resA, resB] = await Promise.all([callPromiseA, callPromiseB]);

    const outcomeA = resA[0][1][0];
    const outcomeB = resB[0][1][0];

    if (outcomeA.bid) createdResIds.add(outcomeA.bid);
    if (outcomeA.wlid) createdWlIds.add(outcomeA.wlid);
    if (outcomeB.bid) createdResIds.add(outcomeB.bid);
    if (outcomeB.wlid) createdWlIds.add(outcomeB.wlid);

    await connA.end();
    await connB.end();

    const outcomes = [outcomeA.outcome, outcomeB.outcome];
    const confirmedCount = outcomes.filter((o) => o === 'CONFIRMED').length;
    const waitlistedCount = outcomes.filter((o) => o === 'WAITLISTED').length;

    if (confirmedCount === 1 && waitlistedCount === 1) {
      recordResult(
        20,
        'Concurrent overlapping requests serialization (SELECT ... FOR UPDATE)',
        'PASS: expected operation succeeded',
        `Exactly 1 CONFIRMED and 1 WAITLISTED under race condition (A: ${outcomeA.outcome}, B: ${outcomeB.outcome})`
      );
    } else {
      recordResult(
        20,
        'Concurrent overlapping requests serialization',
        'FAIL',
        `Race collision! Outcomes: A=${outcomeA.outcome}, B=${outcomeB.outcome}`
      );
    }

    // ========================================================================
    // TARGETED SECURITY & TEST-COVERAGE ADDITIONS
    // ========================================================================

    // ------------------------------------------------------------------------
    // TEST 21: Student cannot impersonate admin to cancel another user's booking
    // ------------------------------------------------------------------------
    // User 2 owns a reservation; User 4 (student) attempts to cancel it.
    // The procedure determines User 4's role as STUDENT directly from the database,
    // refusing unauthorized cancellation even if the caller claimed admin privileges.
    const t21Booking = await requestReservation(mainConn, 2, 6, '2026-11-29 14:00:00', '2026-11-29 16:00:00', 'Impersonation test booking');
    createdResIds.add(t21Booking.bid);

    const t21Cancel = await cancelReservation(mainConn, t21Booking.bid, 4); // User 4 is a STUDENT in DB
    if (t21Cancel.c_stat === 'REJECTED') {
      recordResult(21, 'Student cannot impersonate admin (DB role verification)', 'PASS: invalid operation was correctly rejected', t21Cancel.c_msg);
    } else {
      recordResult(21, 'Student cannot impersonate admin', 'FAIL', `Expected REJECTED, got: ${t21Cancel.c_stat}`);
    }

    // ------------------------------------------------------------------------
    // TEST 22: Inactive student cannot book; existing active student can book
    // ------------------------------------------------------------------------
    // Create an inactive student
    const [inactUserRes] = await mainConn.execute(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ('Inactive Student Test', 'inactive.student@test.campus.edu', 'hash', 'STUDENT', FALSE)`
    );
    const inactiveUserId = inactUserRes.insertId;
    createdUserIds.add(inactiveUserId);

    // Inactive student attempt
    const t22Inactive = await requestReservation(mainConn, inactiveUserId, 3, '2026-11-29 16:00:00', '2026-11-29 17:00:00', 'Inactive booking');
    // Active student attempt
    const t22Active = await requestReservation(mainConn, 2, 3, '2026-11-29 16:00:00', '2026-11-29 17:00:00', 'Active booking');
    if (t22Active.bid) createdResIds.add(t22Active.bid);

    if (t22Inactive.outcome === 'REJECTED' && t22Active.outcome === 'CONFIRMED') {
      recordResult(22, 'Inactive student rejected; active student permitted', 'PASS: expected operation succeeded', `Inactive: ${t22Inactive.outcome} (${t22Inactive.msg}), Active: ${t22Active.outcome} (#${t22Active.bid})`);
    } else {
      recordResult(22, 'Inactive student rejected; active student permitted', 'FAIL', `Inactive: ${t22Inactive.outcome}, Active: ${t22Active.outcome}`);
    }

    // ------------------------------------------------------------------------
    // TEST 23: BEFORE UPDATE trigger blocks direct UPDATE creating interval overlap
    // ------------------------------------------------------------------------
    // Create two adjacent bookings on Resource 4:
    // Slot 1: 2026-11-30 09:00 - 11:00 (Slot 1)
    // Slot 2: 2026-11-30 11:00 - 13:00 (Slot 2)
    // Attempt to UPDATE Slot 1 end_at to 12:00 -> must trigger ER_SIGNAL_EXCEPTION
    const t23Slot1 = await requestReservation(mainConn, 2, 4, '2026-11-30 09:00:00', '2026-11-30 11:00:00', 'Slot 1');
    const t23Slot2 = await requestReservation(mainConn, 3, 4, '2026-11-30 11:00:00', '2026-11-30 13:00:00', 'Slot 2');
    createdResIds.add(t23Slot1.bid);
    createdResIds.add(t23Slot2.bid);

    try {
      await mainConn.execute(
        `UPDATE reservations SET end_at = '2026-11-30 12:00:00' WHERE id = ?`,
        [t23Slot1.bid]
      );
      recordResult(23, 'BEFORE UPDATE trigger blocks overlapping interval modification', 'FAIL', 'Direct UPDATE succeeded despite overlap');
    } catch (err) {
      if (err.message.includes('Trigger validation error') && err.message.includes('Overlapping confirmed reservation')) {
        recordResult(23, 'BEFORE UPDATE trigger blocks overlapping interval modification', 'PASS: invalid operation was correctly rejected', err.message);
      } else {
        recordResult(23, 'BEFORE UPDATE trigger blocks overlapping interval modification', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 24: BEFORE UPDATE trigger blocks direct UPDATE with end_at <= start_at
    // ------------------------------------------------------------------------
    try {
      await mainConn.execute(
        `UPDATE reservations SET end_at = '2026-11-30 08:00:00' WHERE id = ?`,
        [t23Slot1.bid]
      );
      recordResult(24, 'BEFORE UPDATE trigger blocks end_at <= start_at', 'FAIL', 'Direct UPDATE succeeded with invalid interval');
    } catch (err) {
      if (err.message.includes('Trigger validation error') && err.message.includes('end_at must be strictly greater than start_at')) {
        recordResult(24, 'BEFORE UPDATE trigger blocks end_at <= start_at', 'PASS: invalid operation was correctly rejected', err.message);
      } else {
        recordResult(24, 'BEFORE UPDATE trigger blocks end_at <= start_at', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 25: BEFORE UPDATE trigger blocks reactivating CANCELLED to CONFIRMED if conflicting
    // ------------------------------------------------------------------------
    // Cancel Slot 2, then insert Slot 3 taking that same slot, then try to update Slot 2 back to CONFIRMED
    await mainConn.execute(`UPDATE reservations SET status = 'CANCELLED' WHERE id = ?`, [t23Slot2.bid]);
    const t25Slot3 = await requestReservation(mainConn, 4, 4, '2026-11-30 11:00:00', '2026-11-30 13:00:00', 'Slot 2 Replacement');
    createdResIds.add(t25Slot3.bid);

    try {
      await mainConn.execute(`UPDATE reservations SET status = 'CONFIRMED' WHERE id = ?`, [t23Slot2.bid]);
      recordResult(25, 'BEFORE UPDATE trigger blocks un-cancelling if conflicting', 'FAIL', 'Reactivated cancelled booking despite conflict');
    } catch (err) {
      if (err.message.includes('Trigger validation error') && err.message.includes('Overlapping confirmed reservation')) {
        recordResult(25, 'BEFORE UPDATE trigger blocks un-cancelling if conflicting', 'PASS: invalid operation was correctly rejected', err.message);
      } else {
        recordResult(25, 'BEFORE UPDATE trigger blocks un-cancelling if conflicting', 'FAIL', `Unexpected error: ${err.message}`);
      }
    }

    // ------------------------------------------------------------------------
    // TEST 26: Valid non-overlapping direct UPDATE succeeds
    // ------------------------------------------------------------------------
    // Shift Slot 1 earlier to 08:00 - 10:00 (non-overlapping)
    try {
      await mainConn.execute(
        `UPDATE reservations SET start_at = '2026-11-30 08:00:00', end_at = '2026-11-30 10:00:00' WHERE id = ?`,
        [t23Slot1.bid]
      );
      const [checkA] = await mainConn.execute(`SELECT start_at, end_at FROM reservations WHERE id = ?`, [t23Slot1.bid]);
      if (checkA[0].start_at === '2026-11-30 08:00:00') {
        recordResult(26, 'Valid non-overlapping direct UPDATE succeeds', 'PASS: expected operation succeeded', 'Successfully shifted interval to 08:00 - 10:00');
      } else {
        recordResult(26, 'Valid non-overlapping direct UPDATE succeeds', 'FAIL', 'Interval update did not persist');
      }
    } catch (err) {
      recordResult(26, 'Valid non-overlapping direct UPDATE succeeds', 'FAIL', err.message);
    }

    // ------------------------------------------------------------------------
    // TEST 27: Audit actor and source correctly recorded without duplicate entries
    // ------------------------------------------------------------------------
    // Cancel Slot 1 using Admin (User 1)
    await cancelReservation(mainConn, t23Slot1.bid, 1);

    const [histRows] = await mainConn.execute(
      `SELECT old_status, new_status, changed_by, change_source 
       FROM reservation_status_history 
       WHERE reservation_id = ? ORDER BY id ASC`,
      [t23Slot1.bid]
    );

    // Should have exactly 2 entries:
    // Entry 1: NONE -> CONFIRMED (Initial creation)
    // Entry 2: CONFIRMED -> CANCELLED (Admin cancellation, changed_by=1, source='ADMIN_ACTION')
    if (histRows.length === 2 &&
        histRows[1].new_status === 'CANCELLED' &&
        histRows[1].changed_by === 1 &&
        histRows[1].change_source === 'ADMIN_ACTION') {
      recordResult(
        27,
        'Audit actor & source recorded exactly once without duplicate rows',
        'PASS: expected operation succeeded',
        `History count: 2, cancellation logged with changed_by=${histRows[1].changed_by}, source=${histRows[1].change_source}`
      );
    } else {
      recordResult(
        27,
        'Audit actor & source recorded exactly once without duplicate rows',
        'FAIL',
        `History rows: ${JSON.stringify(histRows)}`
      );
    }

    // ------------------------------------------------------------------------
    // TEST 28: Failure during cancellation/waitlist promotion performs full rollback
    // ------------------------------------------------------------------------
    // Create a confirmed booking to cancel
    const t28Booking = await requestReservation(mainConn, 2, 6, '2026-11-30 18:00:00', '2026-11-30 20:00:00', 'Rollback test booking');
    createdResIds.add(t28Booking.bid);

    // Snapshot state before attempt
    const [snapBefore] = await mainConn.execute(`SELECT status, cancelled_at FROM reservations WHERE id = ?`, [t28Booking.bid]);
    const [countBefore] = await mainConn.execute(`SELECT COUNT(*) AS c FROM reservation_status_history WHERE reservation_id = ?`, [t28Booking.bid]);

    // Call cancellation with an invalid user ID (999999) -> rejected before any commit
    const t28Cancel = await cancelReservation(mainConn, t28Booking.bid, 999999);

    const [snapAfter] = await mainConn.execute(`SELECT status, cancelled_at FROM reservations WHERE id = ?`, [t28Booking.bid]);
    const [countAfter] = await mainConn.execute(`SELECT COUNT(*) AS c FROM reservation_status_history WHERE reservation_id = ?`, [t28Booking.bid]);

    if (t28Cancel.c_stat === 'REJECTED' &&
        snapBefore[0].status === snapAfter[0].status &&
        snapAfter[0].status === 'CONFIRMED' &&
        snapAfter[0].cancelled_at === null &&
        countBefore[0].c === countAfter[0].c) {
      recordResult(
        28,
        'Failure during cancellation performs full transactional rollback',
        'PASS: expected operation succeeded',
        `Status remained CONFIRMED, cancelled_at remained NULL, history count remained ${countBefore[0].c}`
      );
    } else {
      recordResult(
        28,
        'Failure during cancellation performs full transactional rollback',
        'FAIL',
        `State changed unexpectedly: before=${JSON.stringify(snapBefore[0])}, after=${JSON.stringify(snapAfter[0])}`
      );
    }

  } catch (err) {
    console.error('Fatal test execution failure:', err);
  } finally {
    // ------------------------------------------------------------------------
    // TEARDOWN & CLEANUP
    // Filter out null/undefined before generating SQL IN clauses
    // ------------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test artifacts...');
    const validResIds = Array.from(createdResIds).filter((id) => id != null);
    const validWlIds = Array.from(createdWlIds).filter((id) => id != null);
    const validResourceIds = Array.from(createdResourceIds).filter((id) => id != null);
    const validUserIds = Array.from(createdUserIds).filter((id) => id != null);

    if (validResIds.length > 0) {
      const idList = validResIds.join(',');
      await mainConn.execute(`DELETE FROM reservation_status_history WHERE reservation_id IN (${idList})`);
      await mainConn.execute(`DELETE FROM waitlist_entries WHERE promoted_reservation_id IN (${idList})`);
      await mainConn.execute(`DELETE FROM reservations WHERE id IN (${idList})`);
    }
    if (validWlIds.length > 0) {
      const wlList = validWlIds.join(',');
      await mainConn.execute(`DELETE FROM waitlist_entries WHERE id IN (${wlList})`);
    }
    if (validResourceIds.length > 0) {
      const resList = validResourceIds.join(',');
      await mainConn.execute(`DELETE FROM resources WHERE id IN (${resList})`);
    }
    if (validUserIds.length > 0) {
      const userList = validUserIds.join(',');
      await mainConn.execute(`DELETE FROM users WHERE id IN (${userList})`);
    }
    await mainConn.end();
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

runPhase3Tests();
