/**
 * Campus Resource Booking & Waitlist Management System
 * Seed Data Script (scripts/seed.mjs)
 * 
 * Inserts reproducible, realistic initial data:
 * - 1 Administrator + 4 Students with valid bcrypt-hashed passwords
 * - 6 Campus Resources across multiple types
 * - Confirmed and Cancelled Reservations across multiple days
 * - Waitlist Entries with priority levels
 * - Reservation Status History audit records
 * 
 * Safe to execute repeatedly without duplicating records or violating constraints.
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus_reserve',
  decimalNumbers: true,
};

async function main() {
  console.log(' Connecting to MySQL database:', dbConfig.database);
  const conn = await mysql.createConnection(dbConfig);

  try {
    console.log(' Generating secure bcrypt password hashes...');
    const saltRounds = 10;
    const adminHash = await bcrypt.hash('Admin@1234', saltRounds);
    const studentHash = await bcrypt.hash('Student@1234', saltRounds);

    console.log(' Upserting Users...');
    const users = [
      {
        fullName: 'Prof. Ramesh Sharma',
        email: 'admin.ramesh@campus.edu',
        passwordHash: adminHash,
        role: 'ADMIN',
      },
      {
        fullName: 'Aarav Patel',
        email: 'aarav.patel@student.campus.edu',
        passwordHash: studentHash,
        role: 'STUDENT',
      },
      {
        fullName: 'Diya Sengupta',
        email: 'diya.sengupta@student.campus.edu',
        passwordHash: studentHash,
        role: 'STUDENT',
      },
      {
        fullName: 'Kavya Nair',
        email: 'kavya.nair@student.campus.edu',
        passwordHash: studentHash,
        role: 'STUDENT',
      },
      {
        fullName: 'Rohan Verma',
        email: 'rohan.verma@student.campus.edu',
        passwordHash: studentHash,
        role: 'STUDENT',
      },
    ];

    for (const u of users) {
      await conn.execute(
        `INSERT INTO users (full_name, email, password_hash, role, is_active)
         VALUES (?, ?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE 
           full_name = VALUES(full_name),
           password_hash = VALUES(password_hash),
           role = VALUES(role),
           is_active = TRUE`,
        [u.fullName, u.email, u.passwordHash, u.role]
      );
    }

    // Retrieve user IDs for relational linkage
    const [userRows] = await conn.execute('SELECT id, email, role FROM users');
    const userMap = new Map();
    userRows.forEach((r) => userMap.set(r.email, r.id));

    console.log(' Upserting Campus Resources...');
    const resources = [
      {
        name: 'Turing Advanced AI & Computing Lab',
        type: 'LAB',
        building: 'Alan Turing Science Block',
        floor: 3,
        roomNumber: 'T-302',
        capacity: 45,
        description: 'High-performance computing lab with GPU workstations and deep learning frameworks.',
      },
      {
        name: 'C.V. Raman Memorial Seminar Hall',
        type: 'SEMINAR_HALL',
        building: 'Dr. C.V. Raman Auditorium Complex',
        floor: 1,
        roomNumber: 'RH-101',
        capacity: 180,
        description: 'Multi-tiered seminar auditorium equipped with dual projection and surround acoustic system.',
      },
      {
        name: 'Executive Boardroom & Conference Suite',
        type: 'CONFERENCE_ROOM',
        building: 'Chanakya Administrative Tower',
        floor: 4,
        roomNumber: 'CR-405',
        capacity: 20,
        description: 'Executive hybrid conference room featuring telepresence hardware and interactive whiteboard.',
      },
      {
        name: 'Smart Interactive Classroom 204',
        type: 'CLASSROOM',
        building: 'Aryabhata Academic Complex',
        floor: 2,
        roomNumber: 'AR-204',
        capacity: 65,
        description: 'Tiered lecture theater with interactive digital display podium and lecture capture cameras.',
      },
      {
        name: 'Collaborative Study Pod Gamma',
        type: 'STUDY_POD',
        building: 'Central Knowledge Resource Center',
        floor: 2,
        roomNumber: 'LIB-P03',
        capacity: 6,
        description: 'Sound-dampened private group discussion and research pod.',
      },
      {
        name: '4K Ultra-HD Drone & Robotics Sensor Kit',
        type: 'EQUIPMENT',
        building: 'Innovation & Maker Hub',
        floor: 0,
        roomNumber: 'MKR-002',
        capacity: 1,
        description: 'High-precision research drone with LiDAR sensor payload for campus robotics projects.',
      },
    ];

    for (const r of resources) {
      const [existing] = await conn.execute(
        'SELECT id FROM resources WHERE name = ? AND building = ? AND room_number = ?',
        [r.name, r.building, r.roomNumber]
      );
      if (existing.length === 0) {
        await conn.execute(
          `INSERT INTO resources (name, resource_type, building, floor, room_number, capacity, description, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [r.name, r.type, r.building, r.floor, r.roomNumber, r.capacity, r.description]
        );
      } else {
        await conn.execute(
          `UPDATE resources 
           SET resource_type = ?, floor = ?, capacity = ?, description = ?, is_active = TRUE
           WHERE id = ?`,
          [r.type, r.floor, r.capacity, r.description, existing[0].id]
        );
      }
    }

    const [resRows] = await conn.execute('SELECT id, name FROM resources');
    const resMap = new Map();
    resRows.forEach((r) => resMap.set(r.name, r.id));

    console.log(' Populating Realistic Seed Reservations across multiple days...');
    // Seed reservations with deterministic dates in Asia/Kolkata
    const turingLabId = resMap.get('Turing Advanced AI & Computing Lab');
    const seminarHallId = resMap.get('C.V. Raman Memorial Seminar Hall');
    const studyPodId = resMap.get('Collaborative Study Pod Gamma');
    const smartClassId = resMap.get('Smart Interactive Classroom 204');

    const aaravId = userMap.get('aarav.patel@student.campus.edu');
    const diyaId = userMap.get('diya.sengupta@student.campus.edu');
    const kavyaId = userMap.get('kavya.nair@student.campus.edu');
    const adminId = userMap.get('admin.ramesh@campus.edu');

    const reservationsToSeed = [
      {
        userId: aaravId,
        resourceId: turingLabId,
        startAt: '2026-11-10 09:00:00',
        endAt: '2026-11-10 11:30:00',
        purpose: 'Deep Learning Final Project Model Training & Hyperparameter Tuning',
        status: 'CONFIRMED',
        cancelledAt: null,
      },
      {
        userId: diyaId,
        resourceId: turingLabId,
        startAt: '2026-11-10 13:00:00',
        endAt: '2026-11-10 15:30:00',
        purpose: 'Computer Vision GPU Benchmarking Session',
        status: 'CONFIRMED',
        cancelledAt: null,
      },
      {
        userId: kavyaId,
        resourceId: seminarHallId,
        startAt: '2026-11-11 10:00:00',
        endAt: '2026-11-11 13:00:00',
        purpose: 'Annual Inter-College Hackathon Opening Ceremony & Keynote',
        status: 'CONFIRMED',
        cancelledAt: null,
      },
      {
        userId: aaravId,
        resourceId: studyPodId,
        startAt: '2026-11-11 14:00:00',
        endAt: '2026-11-11 16:00:00',
        purpose: 'Database Systems Capstone Presentation Dry-run',
        status: 'CONFIRMED',
        cancelledAt: null,
      },
      {
        userId: diyaId,
        resourceId: smartClassId,
        startAt: '2026-11-12 11:00:00',
        endAt: '2026-11-12 12:30:00',
        purpose: 'Peer Tutoring Workshop: Distributed Systems Principles',
        status: 'CONFIRMED',
        cancelledAt: null,
      },
      {
        userId: kavyaId,
        resourceId: turingLabId,
        startAt: '2026-11-08 14:00:00',
        endAt: '2026-11-08 16:00:00',
        purpose: 'Robotics Simulation Workshop (Cancelled prior to event)',
        status: 'CANCELLED',
        cancelledAt: '2026-11-07 18:30:00',
      },
    ];

    for (const r of reservationsToSeed) {
      const [exists] = await conn.execute(
        `SELECT id FROM reservations 
         WHERE user_id = ? AND resource_id = ? AND start_at = ? AND end_at = ?`,
        [r.userId, r.resourceId, r.startAt, r.endAt]
      );

      let reservationId;
      if (exists.length === 0) {
        const [res] = await conn.execute(
          `INSERT INTO reservations (user_id, resource_id, start_at, end_at, purpose, status, cancelled_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [r.userId, r.resourceId, r.startAt, r.endAt, r.purpose, r.status, r.cancelledAt]
        );
        reservationId = res.insertId;
      } else {
        reservationId = exists[0].id;
        await conn.execute(
          `UPDATE reservations 
           SET purpose = ?, status = ?, cancelled_at = ?
           WHERE id = ?`,
          [r.purpose, r.status, r.cancelledAt, reservationId]
        );
      }

      // Record audit history record
      const [histExists] = await conn.execute(
        'SELECT id FROM reservation_status_history WHERE reservation_id = ?',
        [reservationId]
      );
      if (histExists.length === 0) {
        if (r.status === 'CONFIRMED') {
          await conn.execute(
            `INSERT INTO reservation_status_history 
             (reservation_id, old_status, new_status, changed_by, change_source, reason)
             VALUES (?, 'NONE', 'CONFIRMED', ?, 'USER_ACTION', 'Initial booking reservation confirmation')`,
            [reservationId, r.userId]
          );
        } else {
          await conn.execute(
            `INSERT INTO reservation_status_history 
             (reservation_id, old_status, new_status, changed_by, change_source, reason, changed_at)
             VALUES (?, 'CONFIRMED', 'CANCELLED', ?, 'USER_ACTION', 'Cancelled by student due to schedule change', ?)`,
            [reservationId, r.userId, r.cancelledAt || new Date()]
          );
        }
      }
    }

    console.log(' Populating Waitlist Entries (Priority-based)...');
    const rohanId = userMap.get('rohan.verma@student.campus.edu');

    // Rohan verma requests Turing Lab at an overlapping slot: 2026-11-10 10:00 to 12:00
    // Priority 2
    const waitlistItems = [
      {
        userId: rohanId,
        resourceId: turingLabId,
        requestedStartAt: '2026-11-10 10:00:00',
        requestedEndAt: '2026-11-10 12:00:00',
        priorityLevel: 2,
        status: 'WAITING',
      },
      {
        userId: kavyaId,
        resourceId: turingLabId,
        requestedStartAt: '2026-11-10 09:30:00',
        requestedEndAt: '2026-11-10 11:00:00',
        priorityLevel: 3, // lower priority than Rohan (1 is highest, 10 is lowest)
        status: 'WAITING',
      },
      {
        userId: diyaId,
        resourceId: seminarHallId,
        requestedStartAt: '2026-11-11 10:30:00',
        requestedEndAt: '2026-11-11 12:30:00',
        priorityLevel: 1, // highest priority
        status: 'WAITING',
      },
    ];

    for (const w of waitlistItems) {
      const [exists] = await conn.execute(
        `SELECT id FROM waitlist_entries 
         WHERE user_id = ? AND resource_id = ? AND requested_start_at = ? AND requested_end_at = ? AND status = ?`,
        [w.userId, w.resourceId, w.requestedStartAt, w.requestedEndAt, w.status]
      );
      if (exists.length === 0) {
        await conn.execute(
          `INSERT INTO waitlist_entries 
           (user_id, resource_id, requested_start_at, requested_end_at, priority_level, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [w.userId, w.resourceId, w.requestedStartAt, w.requestedEndAt, w.priorityLevel, w.status]
        );
      }
    }

    console.log('\n Seed Data Applied Successfully!');
    console.log('================================================================');
    console.log(' LOCAL DEMO LOGIN CREDENTIALS:');
    console.log('----------------------------------------------------------------');
    console.log(' Administrator:');
    console.log('   Email:    admin.ramesh@campus.edu');
    console.log('   Password: Admin@1234');
    console.log('   Role:     ADMIN');
    console.log('');
    console.log(' Student 1 (Aarav Patel):');
    console.log('   Email:    aarav.patel@student.campus.edu');
    console.log('   Password: Student@1234');
    console.log('   Role:     STUDENT');
    console.log('');
    console.log(' Student 2 (Diya Sengupta):');
    console.log('   Email:    diya.sengupta@student.campus.edu');
    console.log('   Password: Student@1234');
    console.log('');
    console.log(' Student 3 (Kavya Nair):');
    console.log('   Email:    kavya.nair@student.campus.edu');
    console.log('   Password: Student@1234');
    console.log('');
    console.log(' Student 4 (Rohan Verma):');
    console.log('   Email:    rohan.verma@student.campus.edu');
    console.log('   Password: Student@1234');
    console.log('================================================================\n');

  } catch (err) {
    console.error(' Error during seeding:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
