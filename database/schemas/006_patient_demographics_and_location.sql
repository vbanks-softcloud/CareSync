-- Migration 006: richer patient demographics + location.
--
-- We're growing the patient form past what the original schema modeled:
--
--   * Name is now split into first + last (the legacy `name` column stays
--     populated as a convenience concat so existing queries keep working).
--   * Birthdate is the authoritative source for age — the form no longer
--     accepts age as input. The `age` column hangs around for back-compat
--     with rows that pre-date birthdate.
--   * "Room" was a single TEXT column that conflated home addresses and
--     clinic rooms. Now there's an explicit location_type discriminator and
--     two separate sub-records: a home address, or a clinic name + clinic
--     address. The legacy `room` column stays put so we don't lose old data.

USE caresync;

ALTER TABLE patients
  ADD COLUMN first_name VARCHAR(100) NULL DEFAULT NULL,
  ADD COLUMN last_name VARCHAR(100) NULL DEFAULT NULL,
  ADD COLUMN location_type VARCHAR(20) NULL DEFAULT NULL,
  ADD COLUMN home_address TEXT NULL DEFAULT NULL,
  ADD COLUMN clinic_name VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN clinic_address TEXT NULL DEFAULT NULL;
