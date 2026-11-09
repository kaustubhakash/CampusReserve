-- ============================================================================
-- Campus Resource Booking & Waitlist Management System
-- Relational Database DDL Schema (MySQL 8 / InnoDB)
-- Database: campus_reserve
-- Timezone Convention: Asia/Kolkata (IST)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS campus_reserve
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE campus_reserve;

-- Temporarily disable foreign key checks for clean re-creation
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS reservation_status_history;
DROP TABLE IF EXISTS waitlist_entries;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS resources;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. USERS TABLE
-- Stores student and administrator accounts with role-based attributes.
-- ============================================================================
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('STUDENT', 'ADMIN') NOT NULL DEFAULT 'STUDENT',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT chk_users_role CHECK (role IN ('STUDENT', 'ADMIN')),
  CONSTRAINT chk_users_email_format CHECK (email LIKE '%@%._%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. RESOURCES TABLE
-- Campus venues, labs, classrooms, and pods available for booking.
-- ============================================================================
CREATE TABLE resources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  resource_type ENUM(
    'LAB',
    'SEMINAR_HALL',
    'CONFERENCE_ROOM',
    'CLASSROOM',
    'STUDY_POD',
    'EQUIPMENT'
  ) NOT NULL,
  building VARCHAR(80) NOT NULL,
  floor INT NOT NULL,
  room_number VARCHAR(30) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT pk_resources PRIMARY KEY (id),
  CONSTRAINT chk_resources_capacity CHECK (capacity > 0),
  CONSTRAINT chk_resources_floor CHECK (floor >= -2 AND floor <= 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. RESERVATIONS TABLE
-- Confirmed and cancelled resource bookings.
-- Overlap logic: existing.start_at < requested.end_at AND existing.end_at > requested.start_at
-- ============================================================================
CREATE TABLE reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  status ENUM('CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,

  CONSTRAINT pk_reservations PRIMARY KEY (id),
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_reservations_resource FOREIGN KEY (resource_id)
    REFERENCES resources (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT chk_reservations_interval CHECK (end_at > start_at),
  CONSTRAINT chk_reservations_status CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  CONSTRAINT chk_reservations_cancelled_at CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL) OR
    (status = 'CONFIRMED' AND cancelled_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. WAITLIST_ENTRIES TABLE
-- Waitlist for requested resource intervals when reservations collide.
-- Unique active waitlist prevention via stored generated column:
-- active_waitlist_key = user_id:resource_id:start_at:end_at when WAITING, else NULL.
-- Note: MySQL forbids ON UPDATE/DELETE CASCADE on base columns used in STORED generated columns.
-- Hence RESTRICT/NO ACTION is enforced on user_id & resource_id to preserve audit integrity.
-- ============================================================================
CREATE TABLE waitlist_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  requested_start_at DATETIME NOT NULL,
  requested_end_at DATETIME NOT NULL,
  priority_level INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('WAITING', 'PROMOTED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  promoted_at DATETIME NULL,
  promoted_reservation_id BIGINT UNSIGNED NULL,
  
  -- Generated column enforcing unique active request per student, resource and interval
  active_waitlist_key VARCHAR(191) GENERATED ALWAYS AS (
    CASE 
      WHEN status = 'WAITING' THEN 
        CONCAT(user_id, '_', resource_id, '_', DATE_FORMAT(requested_start_at, '%Y%m%d%H%i%s'), '_', DATE_FORMAT(requested_end_at, '%Y%m%d%H%i%s'))
      ELSE NULL 
    END
  ) STORED,

  CONSTRAINT pk_waitlist_entries PRIMARY KEY (id),
  CONSTRAINT fk_waitlist_user FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_waitlist_resource FOREIGN KEY (resource_id)
    REFERENCES resources (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_waitlist_promoted_reservation FOREIGN KEY (promoted_reservation_id)
    REFERENCES reservations (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT uq_waitlist_active_request UNIQUE (active_waitlist_key),
  CONSTRAINT chk_waitlist_interval CHECK (requested_end_at > requested_start_at),
  CONSTRAINT chk_waitlist_priority CHECK (priority_level >= 1 AND priority_level <= 10),
  CONSTRAINT chk_waitlist_status CHECK (status IN ('WAITING', 'PROMOTED', 'CANCELLED')),
  CONSTRAINT chk_waitlist_promoted_state CHECK (
    (status = 'PROMOTED' AND promoted_at IS NOT NULL) OR
    (status <> 'PROMOTED' AND promoted_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. RESERVATION_STATUS_HISTORY TABLE
-- Audit log of status transitions on reservations (e.g. created, cancelled).
-- ============================================================================
CREATE TABLE reservation_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT UNSIGNED NOT NULL,
  old_status ENUM('NONE', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'NONE',
  new_status ENUM('CONFIRMED', 'CANCELLED') NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  change_source ENUM('USER_ACTION', 'ADMIN_ACTION', 'SYSTEM_AUTO_PROMOTION', 'SYSTEM_EXPIRY') NOT NULL DEFAULT 'USER_ACTION',
  reason VARCHAR(255) NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_reservation_status_history PRIMARY KEY (id),
  CONSTRAINT fk_history_reservation FOREIGN KEY (reservation_id)
    REFERENCES reservations (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_history_changed_by FOREIGN KEY (changed_by)
    REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT chk_history_statuses CHECK (
    new_status IN ('CONFIRMED', 'CANCELLED') AND 
    old_status IN ('NONE', 'CONFIRMED', 'CANCELLED')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- C. INDEXES FOR PERFORMANCE AND OPTIMIZATION
-- ============================================================================

-- 1. Active resources by category
CREATE INDEX idx_resources_type_active 
  ON resources (resource_type, is_active);

-- 2. Conflict detection: checks confirmed reservations on a resource
CREATE INDEX idx_reservations_resource_status_times 
  ON reservations (resource_id, status, start_at, end_at);

-- 3. User booking history and dashboard queries
CREATE INDEX idx_reservations_user_history 
  ON reservations (user_id, status, start_at DESC);

-- 4. Calendar date-range lookup across campus
CREATE INDEX idx_reservations_start_end 
  ON reservations (start_at, end_at);

-- 5. Supporting index for resource foreign key
CREATE INDEX idx_waitlist_resource_fk 
  ON waitlist_entries (resource_id);

-- 6. Waitlist queue ordered by priority ASC (1=highest, 10=lowest) and FIFO joined_at ASC
CREATE INDEX idx_waitlist_queue 
  ON waitlist_entries (resource_id, status, priority_level ASC, joined_at ASC);

-- 7. User active waitlist entries query
CREATE INDEX idx_waitlist_user_status 
  ON waitlist_entries (user_id, status);

-- 8. Audit log chronological lookup
CREATE INDEX idx_history_reservation_time 
  ON reservation_status_history (reservation_id, changed_at ASC);
