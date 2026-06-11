/**
 * Care notes CRUD, scoped to a patient.
 *
 *   GET    /api/patients/{patientId}/notes              → list notes for a
 *                                                          patient, newest first
 *   POST   /api/patients/{patientId}/notes              → create a note (the
 *                                                          authed user becomes
 *                                                          the caregiver)
 *   GET    /api/patients/{patientId}/notes/{noteId}     → fetch one note
 *   PUT    /api/patients/{patientId}/notes/{noteId}     → update a note
 *   DELETE /api/patients/{patientId}/notes/{noteId}     → delete a note
 *
 * All routes 404 if the parent patient doesn't exist OR the note doesn't
 * belong to that patient — the {patientId} in the path is treated as part
 * of the row's identity, not just a routing hint.
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
  createdAt: string;
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
  created_at: Date;
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
    createdAt: row.created_at.toISOString(),
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

  // Confirm the patient exists once, up front. Saves us from relying on FK
  // constraint errors for the 404 case (they bubble up as 500s otherwise).
  const patientExists = await checkPatientExists(patientId);
  if (!patientExists) return notFound("Patient");

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

async function checkPatientExists(patientId: string): Promise<boolean> {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT 1 FROM patients WHERE id = ? LIMIT 1",
    [patientId],
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
       patient_concern, care_provided, patient_status, follow_up_needed
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      patientId,
      callerUserId,
      fields.transcript,
      fields.patientConcern,
      fields.careProvided,
      fields.patientStatus,
      fields.followUpNeeded,
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
};

async function update(
  patientId: string,
  noteId: string,
  rawBody: string | undefined | null,
) {
  const body = parseJsonBody<UpdateBody>(rawBody ?? "");

  // PATCH-style: only update the fields the caller actually sent.
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.transcript !== undefined) {
    sets.push("transcript = ?");
    values.push(requireString("transcript", body.transcript));
  }
  if (body.patientConcern !== undefined) {
    sets.push("patient_concern = ?");
    values.push(optionalString("patientConcern", body.patientConcern));
  }
  if (body.careProvided !== undefined) {
    sets.push("care_provided = ?");
    values.push(optionalString("careProvided", body.careProvided));
  }
  if (body.patientStatus !== undefined) {
    sets.push("patient_status = ?");
    values.push(optionalString("patientStatus", body.patientStatus));
  }
  if (body.followUpNeeded !== undefined) {
    sets.push("follow_up_needed = ?");
    values.push(optionalString("followUpNeeded", body.followUpNeeded));
  }

  if (sets.length === 0) {
    throw new ClientError("No updatable fields provided.");
  }

  const db = await getDb();
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
} {
  return {
    transcript: requireString("transcript", body.transcript),
    patientConcern: optionalString("patientConcern", body.patientConcern),
    careProvided: optionalString("careProvided", body.careProvided),
    patientStatus: optionalString("patientStatus", body.patientStatus),
    followUpNeeded: optionalString("followUpNeeded", body.followUpNeeded),
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
