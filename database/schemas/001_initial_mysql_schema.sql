CREATE DATABASE IF NOT EXISTS caresync;
USE caresync;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  cognito_sub VARCHAR(128) UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  -- Profile fields captured during onboarding. NULL-allowed because a user
  -- row may be created (e.g. on first Cognito sign-in) before they finish
  -- the onboarding form; app-layer validation enforces completeness before
  -- letting them into the dashboard.
  first_name VARCHAR(60),
  last_name VARCHAR(60),
  birthdate DATE,
  -- Clinical role the user identifies as. Mirrors the OCCUPATIONS list in
  -- frontend/src/lib/caresync-store.ts and Cognito's `custom:occupation`
  -- attribute. Kept as VARCHAR (not ENUM) so adding a new role in the
  -- frontend doesn't require a schema migration.
  occupation VARCHAR(40),
  -- Auth scope, distinct from clinical occupation above. Defaults to
  -- 'caregiver' for self-signup; 'admin' is granted out-of-band.
  role ENUM('admin', 'caregiver') DEFAULT 'caregiver',
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
