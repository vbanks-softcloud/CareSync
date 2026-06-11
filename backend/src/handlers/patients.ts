/**
 * Patients CRUD.
 *
 * One Lambda handles both /api/patients and /api/patients/{id} — API Gateway
 * routes both paths to this handler, and we branch on method + presence of
 * the {id} path parameter.
 *
 *   GET    /api/patients         → list all patients (every caregiver sees
 *                                  every patient — this is a small clinical
 *                                  team app, not a multi-tenant SaaS)
 *   POST   /api/patients         → create a patient (created_by = caller)
 *   GET    /api/patients/{id}    → get one patient
 *   PUT    /api/patients/{id}    → update a patient
 *   DELETE /api/patients/{id}    → delete a patient (cascades to care_notes)
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
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    room: row.room,
    conditionSummary: row.condition_summary,
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
        return await getOne(patientId);
      case "PUT":
        return await update(patientId, event.body);
      case "DELETE":
        return await remove(patientId);
      default:
        return methodNotAllowed(method);
    }
  }

  switch (method) {
    case "GET":
      return await list();
    case "POST":
      return await create(user.userId, event.body);
    default:
      return methodNotAllowed(method);
  }
});

async function list() {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients ORDER BY created_at DESC",
  );
  return ok({ patients: (rows as PatientRow[]).map(rowToPatient) });
}

async function getOne(id: string) {
  const db = await getDb();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE id = ? LIMIT 1",
    [id],
  );
  if (rows.length === 0) return notFound("Patient");
  return ok(rowToPatient(rows[0] as PatientRow));
}

type CreateBody = {
  name?: unknown;
  age?: unknown;
  room?: unknown;
  conditionSummary?: unknown;
};

async function create(callerUserId: string, rawBody: string | undefined | null) {
  const body = parseJsonBody<CreateBody>(rawBody ?? "");
  const { name, age, room, conditionSummary } = validateCreate(body);

  const db = await getDb();

  // Generate the UUID in the app rather than relying on the DEFAULT (UUID())
  // column default, so we can return the new row's id without an extra
  // round-trip. MySQL 8's UUID() is v1; we use crypto.randomUUID() which is
  // v4 — same column type works for both.
  const id = crypto.randomUUID();

  await db.query<ResultSetHeader>(
    `INSERT INTO patients (id, name, age, room, condition_summary, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, age, room, conditionSummary, callerUserId],
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
};

async function update(id: string, rawBody: string | undefined | null) {
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

  if (fields.length === 0) {
    throw new ClientError("No updatable fields provided.");
  }

  const db = await getDb();
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE patients SET ${fields.join(", ")} WHERE id = ?`,
    [...values, id],
  );
  if (result.affectedRows === 0) return notFound("Patient");

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE id = ? LIMIT 1",
    [id],
  );
  return ok(rowToPatient(rows[0] as PatientRow));
}

async function remove(id: string) {
  const db = await getDb();
  const [result] = await db.query<ResultSetHeader>(
    "DELETE FROM patients WHERE id = ?",
    [id],
  );
  if (result.affectedRows === 0) return notFound("Patient");
  return noContent();
}

function validateCreate(body: CreateBody): {
  name: string;
  age: number;
  room: string | null;
  conditionSummary: string | null;
} {
  return {
    name: requireString("name", body.name),
    age: requireAge(body.age),
    room: optionalString("room", body.room),
    conditionSummary: optionalString("conditionSummary", body.conditionSummary),
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

function requireAge(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 130) {
    throw new ClientError("Field 'age' must be an integer between 0 and 130.");
  }
  return n;
}
