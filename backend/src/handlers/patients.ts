/**
 * Patients CRUD.
 *
 * One Lambda handles both /api/patients and /api/patients/{id} — API Gateway
 * routes both paths to this handler, and we branch on method + presence of
 * the {id} path parameter.
 *
 *   GET    /api/patients         → list patients YOU created (scoped to caller)
 *   POST   /api/patients         → create a patient (created_by = caller)
 *   GET    /api/patients/{id}    → get one of YOUR patients (404 otherwise)
 *   PUT    /api/patients/{id}    → update one of YOUR patients
 *   DELETE /api/patients/{id}    → delete one of YOUR patients (cascades to care_notes)
 *
 * Scoping model: every query includes `WHERE created_by = ?` so user A can
 * never read, mutate, or delete user B's patients. A handler that targets a
 * patient not owned by the caller returns 404 (not 403) so we don't leak
 * the existence of resources owned by other users.
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

type Patient = {
  id: string;
  name: string;
  age: number;
  room: string | null;
  conditionSummary: string | null;
  // ISO date string (YYYY-MM-DD). Added by migration 005. Null when
  // unknown at intake — the UI falls back to the `age` column for display.
  birthdate: string | null;
  // Free-form string ("Male", "Female", "Other", "Prefer not to say", ...).
  // Stored as VARCHAR rather than ENUM so we can add new options without
  // a schema migration.
  gender: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type PatientRow = {
  id: string;
  name: string;
  age: number;
  room: string | null;
  condition_summary: string | null;
  // mysql2 returns DATE columns as Date objects unless dateStrings is on.
  // We slice to YYYY-MM-DD for the wire format.
  birthdate: Date | string | null;
  gender: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToPatient(row: PatientRow): Patient {
  let birthdate: string | null = null;
  if (row.birthdate instanceof Date) {
    // toISOString() returns full timestamp; we want just the date portion.
    birthdate = row.birthdate.toISOString().slice(0, 10);
  } else if (typeof row.birthdate === "string" && row.birthdate.length >= 10) {
    birthdate = row.birthdate.slice(0, 10);
  }
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    room: row.room,
    conditionSummary: row.condition_summary,
    birthdate,
    gender: row.gender ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const handler = withAuth(async (event, user) => {
  const method = event.requestContext.http.method;
  const patientId = event.pathParameters?.id;

  if (patientId) {
    switch (method) {
      case "GET":
        return await getOne(user.userId, patientId);
      case "PUT":
        return await update(user.userId, patientId, event.body);
      case "DELETE":
        return await remove(user.userId, patientId);
      default:
        return methodNotAllowed(method);
    }
  }

  switch (method) {
    case "GET":
      return await list(user.userId);
    case "POST":
      return await create(user.userId, event.body);
    default:
      return methodNotAllowed(method);
  }
});

async function list(callerUserId: string) {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE created_by = ? ORDER BY created_at DESC",
    [callerUserId],
  );
  return ok({ patients: (rows as PatientRow[]).map(rowToPatient) });
}

async function getOne(callerUserId: string, id: string) {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE id = ? AND created_by = ? LIMIT 1",
    [id, callerUserId],
  );
  if (rows.length === 0) return notFound("Patient");
  return ok(rowToPatient(rows[0] as PatientRow));
}

type CreateBody = {
  name?: unknown;
  age?: unknown;
  room?: unknown;
  conditionSummary?: unknown;
  birthdate?: unknown;
  gender?: unknown;
};

async function create(callerUserId: string, rawBody: string | undefined | null) {
  const body = parseJsonBody<CreateBody>(rawBody ?? "");
  const { name, age, room, conditionSummary, birthdate, gender } = validateCreate(body);

  const db = await getDb();

  // Generate the UUID in the app rather than relying on the DEFAULT (UUID())
  // column default, so we can return the new row's id without an extra
  // round-trip. MySQL 8's UUID() is v1; we use crypto.randomUUID() which is
  // v4 — same column type works for both.
  const id = crypto.randomUUID();

  await db.query<ResultSetHeader>(
    `INSERT INTO patients
       (id, name, age, room, condition_summary, birthdate, gender, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, age, room, conditionSummary, birthdate, gender, callerUserId],
  );

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE id = ? LIMIT 1",
    [id],
  );
  return created(rowToPatient(rows[0] as PatientRow));
}

type UpdateBody = {
  name?: unknown;
  age?: unknown;
  room?: unknown;
  conditionSummary?: unknown;
  birthdate?: unknown;
  gender?: unknown;
};

async function update(callerUserId: string, id: string, rawBody: string | undefined | null) {
  const body = parseJsonBody<UpdateBody>(rawBody ?? "");

  // Only update the fields actually provided. Lets the frontend send partial
  // updates (PATCH-style) even though the route is named PUT.
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(requireString("name", body.name));
  }
  if (body.age !== undefined) {
    fields.push("age = ?");
    values.push(requireAge(body.age));
  }
  if (body.room !== undefined) {
    fields.push("room = ?");
    values.push(optionalString("room", body.room));
  }
  if (body.conditionSummary !== undefined) {
    fields.push("condition_summary = ?");
    values.push(optionalString("conditionSummary", body.conditionSummary));
  }
  if (body.birthdate !== undefined) {
    fields.push("birthdate = ?");
    values.push(optionalBirthdate(body.birthdate));
  }
  if (body.gender !== undefined) {
    fields.push("gender = ?");
    values.push(optionalString("gender", body.gender));
  }

  if (fields.length === 0) {
    throw new ClientError("No updatable fields provided.");
  }

  const db = await getDb();
  // The created_by check makes this UPDATE a no-op when the caller doesn't
  // own the row. The 404 below treats "not yours" the same as "doesn't
  // exist" so we don't leak the existence of other users' patients.
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE patients SET ${fields.join(", ")} WHERE id = ? AND created_by = ?`,
    [...values, id, callerUserId],
  );
  if (result.affectedRows === 0) return notFound("Patient");

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE id = ? LIMIT 1",
    [id],
  );
  return ok(rowToPatient(rows[0] as PatientRow));
}

async function remove(callerUserId: string, id: string) {
  const db = await getDb();
  const [result] = await db.query<ResultSetHeader>(
    "DELETE FROM patients WHERE id = ? AND created_by = ?",
    [id, callerUserId],
  );
  if (result.affectedRows === 0) return notFound("Patient");
  return noContent();
}

function validateCreate(body: CreateBody): {
  name: string;
  age: number;
  room: string | null;
  conditionSummary: string | null;
  birthdate: string | null;
  gender: string | null;
} {
  return {
    name: requireString("name", body.name),
    age: requireAge(body.age),
    room: optionalString("room", body.room),
    conditionSummary: optionalString("conditionSummary", body.conditionSummary),
    birthdate: optionalBirthdate(body.birthdate),
    gender: optionalString("gender", body.gender),
  };
}

// Accepts a YYYY-MM-DD string (or null/empty for no birthdate). We don't
// store time-of-day so anything more precise is rejected, and we cap the
// allowed range at "anything from 1900 to today" — that catches almost all
// real birthdates but flags obvious typos like 2026 or 0023.
function optionalBirthdate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") {
    throw new ClientError("Field 'birthdate' must be a YYYY-MM-DD string.");
  }
  const trimmed = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ClientError("Field 'birthdate' must be in YYYY-MM-DD format.");
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ClientError("Field 'birthdate' is not a valid date.");
  }
  const year = parsed.getUTCFullYear();
  const now = new Date();
  if (year < 1900 || parsed > now) {
    throw new ClientError("Field 'birthdate' must be between 1900 and today.");
  }
  return trimmed;
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

function requireAge(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 130) {
    throw new ClientError("Field 'age' must be an integer between 0 and 130.");
  }
  return n;
}
