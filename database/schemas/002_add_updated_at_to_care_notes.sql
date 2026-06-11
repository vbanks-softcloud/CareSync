-- Migration 002: add updated_at to care_notes.
--
-- The original schema only tracked created_at. To surface "last edited" in
-- the UI we need a column that MySQL bumps automatically on every UPDATE.
-- The ON UPDATE clause does that for us; no application code change required
-- besides reading it back out.
--
-- For rows that already exist (created under schema 001), we back-fill
-- updated_at = created_at so they don't all suddenly look like they were
-- just edited the moment we run this migration.

USE caresync;

ALTER TABLE care_notes
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

UPDATE care_notes SET updated_at = created_at;
