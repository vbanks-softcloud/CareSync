/**
 * Care notes CRUD, scoped to a patient AND to the calling user.
 *
 *   GET    /api/patients/{patientId}/notes              → list notes for one
 *                                                          of YOUR patients
 *   POST   /api/patients/{patientId}/notes              → create a note for one
 *                                                          of YOUR patients
 *   GET    /api/patients/{patientId}/notes/{noteId}     → fetch one note
 *   PUT    /api/patients/{patientId}/notes/{noteId}     → update a note
 *   DELETE /api/patients/{patientId}/notes/{noteId}     → delete a note
 *
 * The first thing every request does is verify the parent patient exists
 * AND was created by the caller — that single check inherits ownership
 * down to notes, since you can only ever read/write notes for patients
 * you created. All "not yours" cases return 404 so we don't leak the
 * existence of resources owned by other users.
 */

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { withAuth, ClientError } from "../lib/handler.js";
import {
  ok,
  created,
  noContent,
  notFound,
  methodNotAllowed,
  parseJsonBody,
} from "../lib/http.js";
import { getDb } from "../lib/db.js";

type Note = {
  id: string;
  patientId: string;
  caregiverId: string | null;
  transcript: string;
  patientConcern: string | null;
  careProvided: string | null;
  patientStatus: string | null;
  followUpNeeded: string | null;
  // Migration 004: free-form catch-all section.
  miscellaneousNotes: string | null;
  createdAt: string;
  updatedAt: string;
  // Per-field edit timestamps (migrations 003 + 004). null means the field
  // has never been edited since the note was created. The UI uses these to
  // badge individual sections with their own "Last edited" times.
  transcriptEditedAt: string | null;
  patientConcernEditedAt: string | null;
  careProvidedEditedAt: string | null;
  patientStatusEditedAt: string | null;
  followUpNeededEditedAt: string | null;
  miscellaneousNotesEditedAt: string | null;
};

type NoteRow = {
  id: string;
  patient_id: string;
  caregiver_id: string | null;
  transcript: string;
  patient_concern: string | null;
  care_provided: string | null;
  patient_status: string | null;
  follow_up_needed: string | null;
  miscellaneous_notes: string | null;
  created_at: Date;
  // Added by migration 002. Backfilled to created_at for rows that pre-date
  // the column, so old notes don't render as "just edited" in the UI.
  updated_at: Date;
  // Added by migrations 003 + 004.
  transcript_edited_at: Date | null;
  patient_concern_edited_at: Date | null;
  care_provided_edited_at: Date | null;
  patient_status_edited_at: Date | null;
  follow_up_needed_edited_at: Date | null;
  miscellaneous_notes_edited_at: Date | null;
};

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    patientId: row.patient_id,
    caregiverId: row.caregiver_id,
    transcript: row.transcript,
    patientConcern: row.patient_concern,
    careProvided: row.care_provided,
    patientStatus: row.patient_status,
    followUpNeeded: row.follow_up_needed,
    miscellaneousNotes: row.miscellaneous_notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    transcriptEditedAt: row.transcript_edited_at?.toISOString() ?? null,
    patientConcernEditedAt: row.patient_concern_edited_at?.toISOString() ?? null,
    careProvidedEditedAt: row.care_provided_edited_at?.toISOString() ?? null,
    patientStatusEditedAt: row.patient_status_edited_at?.toISOString() ?? null,
    followUpNeededEditedAt: row.follow_up_needed_edited_at?.toISOString() ?? null,
    miscellaneousNotesEditedAt: row.miscellaneous_notes_edited_at?.toISOString() ?? null,
  };
}

export const handler = withAuth(async (event, user) => {
  const method = event.requestContext.http.method;
  const patientId = event.pathParameters?.patientId;
  const noteId = event.pathParameters?.noteId;

  if (!patientId) {
    // serverless.yml only routes paths with {patientId}, so this is
    // defensive — should never fire in practice.
    return notFound("Patient");
  }

  // Confirm the patient exists AND was created by the caller. This single
  // gate is how note ownership inherits from patient ownership: if you
  // didn't create the patient, you can't even reach the notes handlers
  // below for it. 404 (not 403) so we don't leak that someone else's
  // patient with that id exists.
  const patientOwned = await checkPatientOwnedByUser(patientId, user.userId);
  if (!patientOwned) return notFound("Patient");

  if (noteId) {
    switch (method) {
      case "GET":
        return await getOne(patientId, noteId);
      case "PUT":
        return await update(patientId, noteId, event.body);
      case "DELETE":
        return await remove(patientId, noteId);
      default:
        return methodNotAllowed(method);
    }
  }

  switch (method) {
    case "GET":
      return await list(patientId);
    case "POST":
      return await create(patientId, user.userId, event.body);
    default:
      return methodNotAllowed(method);
  }
});

async function checkPatientOwnedByUser(
  patientId: string,
  callerUserId: string,
): Promise<boolean> {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT 1 FROM patients WHERE id = ? AND created_by = ? LIMIT 1",
    [patientId, callerUserId],
  );
  return rows.length > 0;
}

async function list(patientId: string) {
  const db = await getDb();
  // Index idx_care_notes_patient_created backs this exact query — keeps
  // list performance flat as the table grows.
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM care_notes WHERE patient_id = ? ORDER BY created_at DESC",
    [patientId],
  );
  return ok({ notes: (rows as NoteRow[]).map(rowToNote) });
}

async function getOne(patientId: string, noteId: string) {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM care_notes WHERE id = ? AND patient_id = ? LIMIT 1",
    [noteId, patientId],
  );
  if (rows.length === 0) return notFound("Note");
  return ok(rowToNote(rows[0] as NoteRow));
}

type CreateBody = {
  transcript?: unknown;
  patientConcern?: unknown;
  careProvided?: unknown;
  patientStatus?: unknown;
  followUpNeeded?: unknown;
  miscellaneousNotes?: unknown;
};

async function create(
  patientId: string,
  callerUserId: string,
  rawBody: string | undefined | null,
) {
  const body = parseJsonBody<CreateBody>(rawBody ?? "");
  const fields = validateCreate(body);

  const db = await getDb();
  const id = crypto.randomUUID();

  await db.query<ResultSetHeader>(
    `INSERT INTO care_notes (
       id, patient_id, caregiver_id, transcript,
       patient_concern, care_provided, patient_status, follow_up_needed,
       miscellaneous_notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      patientId,
      callerUserId,
      fields.transcript,
      fields.patientConcern,
      fields.careProvided,
      fields.patientStatus,
      fields.followUpNeeded,
      fields.miscellaneousNotes,
    ],
  );

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM care_notes WHERE id = ? LIMIT 1",
    [id],
  );
  return created(rowToNote(rows[0] as NoteRow));
}

type UpdateBody = {
  transcript?: unknown;
  patientConcern?: unknown;
  careProvided?: unknown;
  patientStatus?: unknown;
  followUpNeeded?: unknown;
  miscellaneousNotes?: unknown;
};

async function update(
  patientId: string,
  noteId: string,
  rawBody: string | undefined | null,
) {
  const body = parseJsonBody<UpdateBody>(rawBody ?? "");

  // We need the current row so we can compare-by-value and only bump the
  // per-field _edited_at columns when a field's value actually changed.
  // Without this, saving the dialog with no real edits would stamp every
  // column as "just edited", which is the opposite of what the UI wants.
  const db = await getDb();
  const [existingRows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM care_notes WHERE id = ? AND patient_id = ? LIMIT 1",
    [noteId, patientId],
  );
  if (existingRows.length === 0) return notFound("Note");
  const existing = existingRows[0] as NoteRow;

  // PATCH-style: only update the fields the caller actually sent. For each
  // sent field, set its value column AND its _edited_at column ONLY if the
  // value differs from what's already in the row.
  const sets: string[] = [];
  const values: unknown[] = [];

  const maybeUpdate = (
    sent: unknown,
    column: string,
    editedColumn: string,
    normalize: (v: unknown) => string | null,
  ) => {
    if (sent === undefined) return;
    const next = normalize(sent);
    const current = (existing as Record<string, unknown>)[column];
    // Compare against null/empty consistently — optionalString returns null
    // for empty strings, and the DB stores NULL for cleared fields.
    const changed = (current ?? null) !== (next ?? null);
    if (changed) {
      sets.push(`${column} = ?`);
      values.push(next);
      sets.push(`${editedColumn} = CURRENT_TIMESTAMP`);
    }
  };

  // Transcript is required (never nullable), so use a wrapper that throws
  // if a non-string snuck through. Everything else allows null.
  if (body.transcript !== undefined) {
    const next = requireString("transcript", body.transcript);
    if (existing.transcript !== next) {
      sets.push("transcript = ?");
      values.push(next);
      sets.push("transcript_edited_at = CURRENT_TIMESTAMP");
    }
  }
  maybeUpdate(body.patientConcern, "patient_concern", "patient_concern_edited_at", (v) =>
    optionalString("patientConcern", v),
  );
  maybeUpdate(body.careProvided, "care_provided", "care_provided_edited_at", (v) =>
    optionalString("careProvided", v),
  );
  maybeUpdate(body.patientStatus, "patient_status", "patient_status_edited_at", (v) =>
    optionalString("patientStatus", v),
  );
  maybeUpdate(body.followUpNeeded, "follow_up_needed", "follow_up_needed_edited_at", (v) =>
    optionalString("followUpNeeded", v),
  );
  maybeUpdate(
    body.miscellaneousNotes,
    "miscellaneous_notes",
    "miscellaneous_notes_edited_at",
    (v) => optionalString("miscellaneousNotes", v),
  );

  if (sets.length === 0) {
    // No fields actually changed. Return the existing row so the client's
    // optimistic update lines up with what's in the DB.
    return ok(rowToNote(existing));
  }

  // Scope the UPDATE to (id, patient_id) so a caller can't update a note by
  // ID alone if they happen to know the UUID — the URL path is part of the
  // identity check.
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE care_notes SET ${sets.join(", ")} WHERE id = ? AND patient_id = ?`,
    [...values, noteId, patientId],
  );
  if (result.affectedRows === 0) return notFound("Note");

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM care_notes WHERE id = ? LIMIT 1",
    [noteId],
  );
  return ok(rowToNote(rows[0] as NoteRow));
}

async function remove(patientId: string, noteId: string) {
  const db = await getDb();
  const [result] = await db.query<ResultSetHeader>(
    "DELETE FROM care_notes WHERE id = ? AND patient_id = ?",
    [noteId, patientId],
  );
  if (result.affectedRows === 0) return notFound("Note");
  return noContent();
}

function validateCreate(body: CreateBody): {
  transcript: string;
  patientConcern: string | null;
  careProvided: string | null;
  patientStatus: string | null;
  followUpNeeded: string | null;
  miscellaneousNotes: string | null;
} {
  return {
    transcript: requireString("transcript", body.transcript),
    patientConcern: optionalString("patientConcern", body.patientConcern),
    careProvided: optionalString("careProvided", body.careProvided),
    patientStatus: optionalString("patientStatus", body.patientStatus),
    followUpNeeded: optionalString("followUpNeeded", body.followUpNeeded),
    miscellaneousNotes: optionalString("miscellaneousNotes", body.miscellaneousNotes),
  };
}

function requireString(field: string, v: unknown): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new ClientError(`Field '${field}' is required and must be a non-empty string.`);
  }
  return v.trim();
}

function optionalString(field: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") {
    throw new ClientError(`Field '${field}' must be a string if provided.`);
  }
  return v.trim();
}
