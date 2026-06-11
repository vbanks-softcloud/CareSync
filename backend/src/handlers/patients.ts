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
 *
 * Schema evolution note (migration 006): the form now collects first/last
 * name separately, birthdate as the authoritative source for age, and a
 * location type (home vs clinic) with type-specific sub-fields. We keep
 * populating the legacy `name`/`age`/`room` columns (since they're
 * NOT NULL or referenced by older queries) but derive them from the new
 * fields on create. Reads expose the new fields directly; the legacy `name`
 * is still surfaced for any UI that hasn't been migrated yet.
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

type LocationType = "home" | "clinic";

type Patient = {
  id: string;
  // Always populated. For records created post-migration-006 this is
  // `firstName + " " + lastName`; for legacy rows it's whatever single
  // string the older form collected.
  name: string;
  firstName: string | null;
  lastName: string | null;
  // Derived from birthdate on write. Still surfaced for UI parity with
  // legacy rows that have age but no birthdate.
  age: number;
  // Legacy free-form text. New writes leave this null; reads still expose
  // it so any old data remains visible.
  room: string | null;
  conditionSummary: string | null;
  birthdate: string | null;
  // Free-form ("Female", "Male", "Non-binary", "Other", "Prefer not to say",
  // ...). VARCHAR rather than ENUM so we can add options without a schema
  // change.
  gender: string | null;
  locationType: LocationType | null;
  homeAddress: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type PatientRow = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  age: number;
  room: string | null;
  condition_summary: string | null;
  birthdate: Date | string | null;
  gender: string | null;
  location_type: string | null;
  home_address: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToPatient(row: PatientRow): Patient {
  let birthdate: string | null = null;
  if (row.birthdate instanceof Date) {
    birthdate = row.birthdate.toISOString().slice(0, 10);
  } else if (typeof row.birthdate === "string" && row.birthdate.length >= 10) {
    birthdate = row.birthdate.slice(0, 10);
  }
  const locationType: LocationType | null =
    row.location_type === "home" || row.location_type === "clinic"
      ? row.location_type
      : null;
  return {
    id: row.id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    age: row.age,
    room: row.room,
    conditionSummary: row.condition_summary,
    birthdate,
    gender: row.gender ?? null,
    locationType,
    homeAddress: row.home_address,
    clinicName: row.clinic_name,
    clinicAddress: row.clinic_address,
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
  // Required (new shape)
  firstName?: unknown;
  lastName?: unknown;
  birthdate?: unknown;
  conditionSummary?: unknown;
  // Optional
  gender?: unknown;
  locationType?: unknown;
  homeAddress?: unknown;
  clinicName?: unknown;
  clinicAddress?: unknown;
  // Legacy / backward-compat (still accepted but unused if the new fields
  // are present)
  name?: unknown;
  age?: unknown;
  room?: unknown;
};

async function create(callerUserId: string, rawBody: string | undefined | null) {
  const body = parseJsonBody<CreateBody>(rawBody ?? "");
  const validated = validateCreate(body);
  const {
    firstName,
    lastName,
    birthdate,
    conditionSummary,
    gender,
    locationType,
    homeAddress,
    clinicName,
    clinicAddress,
  } = validated;

  // Derive the legacy columns from the new fields so existing UI and any
  // older queries keep working without a backfill pass.
  const name = `${firstName} ${lastName}`.trim();
  const age = ageFromBirthdate(birthdate);
  // The room column is no longer collected by the form. We leave it null
  // and rely on the location_type-specific columns to convey the address.
  const room: string | null = null;

  const db = await getDb();
  const id = crypto.randomUUID();

  await db.query<ResultSetHeader>(
    `INSERT INTO patients
       (id, name, first_name, last_name, age, room, condition_summary,
        birthdate, gender, location_type, home_address, clinic_name,
        clinic_address, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      firstName,
      lastName,
      age,
      room,
      conditionSummary,
      birthdate,
      gender,
      locationType,
      homeAddress,
      clinicName,
      clinicAddress,
      callerUserId,
    ],
  );

  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT * FROM patients WHERE id = ? LIMIT 1",
    [id],
  );
  return created(rowToPatient(rows[0] as PatientRow));
}

type UpdateBody = {
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  age?: unknown;
  room?: unknown;
  conditionSummary?: unknown;
  birthdate?: unknown;
  gender?: unknown;
  locationType?: unknown;
  homeAddress?: unknown;
  clinicName?: unknown;
  clinicAddress?: unknown;
};

async function update(callerUserId: string, id: string, rawBody: string | undefined | null) {
  const body = parseJsonBody<UpdateBody>(rawBody ?? "");

  // Only update the fields actually provided. Lets the frontend send partial
  // updates (PATCH-style) even though the route is named PUT.
  const fields: string[] = [];
  const values: unknown[] = [];

  // Name handling: callers can send `name` directly (legacy) or send first +
  // last (preferred). If both are sent, the explicit `name` wins so an old
  // client doesn't get silently overridden.
  let firstNameProvided: string | null | undefined;
  let lastNameProvided: string | null | undefined;
  if (body.firstName !== undefined) {
    firstNameProvided = requireString("firstName", body.firstName);
    fields.push("first_name = ?");
    values.push(firstNameProvided);
  }
  if (body.lastName !== undefined) {
    lastNameProvided = requireString("lastName", body.lastName);
    fields.push("last_name = ?");
    values.push(lastNameProvided);
  }
  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(requireString("name", body.name));
  } else if (firstNameProvided !== undefined && lastNameProvided !== undefined) {
    // Caller updated both halves but didn't send a combined name; keep the
    // legacy `name` column in sync.
    fields.push("name = ?");
    values.push(`${firstNameProvided} ${lastNameProvided}`.trim());
  }

  // Birthdate is the source of truth for age. If the caller sends a new
  // birthdate, we recompute age from it (and any explicit `age` they sent
  // is ignored). If they send age without birthdate, we accept it for
  // back-compat with the legacy form.
  if (body.birthdate !== undefined) {
    const bd = optionalBirthdate(body.birthdate);
    fields.push("birthdate = ?");
    values.push(bd);
    if (bd) {
      fields.push("age = ?");
      values.push(ageFromBirthdate(bd));
    }
  } else if (body.age !== undefined) {
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
  if (body.gender !== undefined) {
    fields.push("gender = ?");
    values.push(optionalString("gender", body.gender));
  }
  if (body.locationType !== undefined) {
    fields.push("location_type = ?");
    values.push(optionalLocationType(body.locationType));
  }
  if (body.homeAddress !== undefined) {
    fields.push("home_address = ?");
    values.push(optionalString("homeAddress", body.homeAddress));
  }
  if (body.clinicName !== undefined) {
    fields.push("clinic_name = ?");
    values.push(optionalString("clinicName", body.clinicName));
  }
  if (body.clinicAddress !== undefined) {
    fields.push("clinic_address = ?");
    values.push(optionalString("clinicAddress", body.clinicAddress));
  }

  if (fields.length === 0) {
    throw new ClientError("No updatable fields provided.");
  }

  const db = await getDb();
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
  firstName: string;
  lastName: string;
  birthdate: string;
  conditionSummary: string;
  gender: string | null;
  locationType: LocationType | null;
  homeAddress: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
} {
  // Required fields per the new form contract.
  const firstName = requireString("firstName", body.firstName);
  const lastName = requireString("lastName", body.lastName);
  const birthdate = requireBirthdate(body.birthdate);
  const conditionSummary = requireString("conditionSummary", body.conditionSummary);

  // Optional demographics + location.
  const gender = optionalString("gender", body.gender);
  const locationType = optionalLocationType(body.locationType);
  let homeAddress: string | null = null;
  let clinicName: string | null = null;
  let clinicAddress: string | null = null;

  // Only persist the sub-fields that match the chosen location type, so we
  // don't accidentally store stale clinic info on a patient who lives at
  // home (or vice versa) if the caller sends both branches' fields.
  if (locationType === "home") {
    homeAddress = optionalString("homeAddress", body.homeAddress);
  } else if (locationType === "clinic") {
    clinicName = optionalString("clinicName", body.clinicName);
    clinicAddress = optionalString("clinicAddress", body.clinicAddress);
  }

  return {
    firstName,
    lastName,
    birthdate,
    conditionSummary,
    gender,
    locationType,
    homeAddress,
    clinicName,
    clinicAddress,
  };
}

// Same shape rules as optionalBirthdate but birthdate is required.
function requireBirthdate(v: unknown): string {
  const bd = optionalBirthdate(v);
  if (!bd) {
    throw new ClientError("Field 'birthdate' is required (YYYY-MM-DD).");
  }
  return bd;
}

// Accepts a YYYY-MM-DD string (or null/empty for no birthdate). We don't
// store time-of-day so anything more precise is rejected, and we cap the
// allowed range at "anything from 1900 to today" — that catches almost all
// real birthdates but flags obvious typos like 2099 or 0023.
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

// UTC-based age calculation. Off-by-one days don't matter for an EHR — the
// "is the user's birthday this year past today?" check uses month+day in
// UTC so different client timezones produce the same answer.
function ageFromBirthdate(birthdate: string): number {
  const bd = new Date(`${birthdate}T00:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - bd.getUTCFullYear();
  const beforeBirthdayThisYear =
    now.getUTCMonth() < bd.getUTCMonth() ||
    (now.getUTCMonth() === bd.getUTCMonth() && now.getUTCDate() < bd.getUTCDate());
  if (beforeBirthdayThisYear) years -= 1;
  return Math.max(0, years);
}

function optionalLocationType(v: unknown): LocationType | null {
  if (v === null || v === undefined || v === "") return null;
  if (v !== "home" && v !== "clinic") {
    throw new ClientError("Field 'locationType' must be 'home' or 'clinic'.");
  }
  return v;
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
