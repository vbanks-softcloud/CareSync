-- Migration 004: add a free-form miscellaneous_notes column to care_notes.
--
-- Caregivers asked for a catch-all section below "Follow-up needed" for
-- anything that doesn't fit into the four structured fields (e.g. family
-- contact made, equipment notes, scheduling reminders). We mirror the
-- per-field "edited at" pattern from migration 003 so this section can
-- carry its own "Edited X" badge in the UI just like the others.

USE caresync;

ALTER TABLE care_notes
  ADD COLUMN miscellaneous_notes TEXT NULL DEFAULT NULL,
  ADD COLUMN miscellaneous_notes_edited_at TIMESTAMP NULL DEFAULT NULL;
