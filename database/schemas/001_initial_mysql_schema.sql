CREATE DATABASE IF NOT EXISTS caresync;
USE caresync;

-- The `users` table is intentionally minimal. Cognito (us-east-1_aIqAshPg1)
-- is the single source of truth for user identity, email, name, birthdate,
-- and clinical role (`custom:occupation`). This row only exists so that
-- patient/note/audit rows have a stable internal foreign key to attach to;
-- all human-readable details are looked up via `cognito_sub` against the
-- Cognito IDP when the app actually needs to display them.
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  cognito_sub VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE patients (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(150) NOT NULL,
  age INT NOT NULL,
  room VARCHAR(50),
  condition_summary VARCHAR(255),
  created_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE care_notes (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  patient_id CHAR(36) NOT NULL,
  caregiver_id CHAR(36),
  transcript TEXT NOT NULL,
  patient_concern TEXT,
  care_provided TEXT,
  patient_status TEXT,
  follow_up_needed TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (caregiver_id) REFERENCES users(id),
  INDEX idx_care_notes_patient_created (patient_id, created_at)
);

-- Audit Table

CREATE TABLE audit_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE voice_recordings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  note_id CHAR(36) NOT NULL,
  s3_bucket VARCHAR(255) NOT NULL,
  s3_key VARCHAR(500) NOT NULL,
  duration_seconds INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (note_id) REFERENCES care_notes(id) ON DELETE CASCADE
);
