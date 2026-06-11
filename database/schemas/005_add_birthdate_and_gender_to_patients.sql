-- Migration 005: add birthdate + gender to patients.
--
-- The dashboard header wants to show birthdate, age, and gender next to
-- the patient's name. Age has been in the schema since day one, so we
-- only need to add the two new columns. Both are nullable because they're
-- not always known at intake time — caregivers often add a patient first
-- and fill in demographics later.
--
-- gender is stored as a free-form string rather than an ENUM so the app
-- can introduce new options (e.g. "Non-binary") without schema migrations.

USE caresync;

ALTER TABLE patients
  ADD COLUMN birthdate DATE NULL DEFAULT NULL,
  ADD COLUMN gender VARCHAR(20) NULL DEFAULT NULL;
