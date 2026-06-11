-- Migration 003: add per-field "last edited at" timestamps to care_notes.
--
-- Migration 002 added a single updated_at that MySQL auto-bumps on any
-- change. That tells us when the note as a whole was last touched, but not
-- which field was actually edited.
--
-- The UI wants to badge each section ("Patient concern", "Care provided",
-- etc.) with its own edit timestamp so caregivers can see at a glance which
-- piece of a note was revised most recently. To support that we record an
-- *_edited_at column per editable field.
--
-- NULL means "this field has never been edited since the note was created".
-- The backend sets the column to CURRENT_TIMESTAMP only when a PUT request
-- changes that specific field's value. Untouched fields stay NULL so we
-- never show stale "edited" badges next to fields the user never touched.

USE caresync;

ALTER TABLE care_notes
  ADD COLUMN transcript_edited_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN patient_concern_edited_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN care_provided_edited_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN patient_status_edited_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN follow_up_needed_edited_at TIMESTAMP NULL DEFAULT NULL;
