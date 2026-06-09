// Field names mirror the `care_notes` columns in
// database/schemas/001_initial_mysql_schema.sql so the wire format is a
// straight camelCase ↔ snake_case mapping when we eventually persist
// these to RDS.
export type StructuredNote = {
  patientConcern: string;
  careProvided: string;
  patientStatus: string;
  followUpNeeded: string;
};

export type Note = {
  id: string;
  patientId: string;
  createdAt: number;
  transcript: string;
  structured: StructuredNote;
};

// Field names mirror the `patients` columns in
// database/schemas/001_initial_mysql_schema.sql. `conditionSummary` maps to
// the SQL `condition_summary` column (the word `condition` is reserved in
// SQL, which is why the column is named that way).
export type Patient = {
  id: string;
  name: string;
  age: number;
  room?: string;
  conditionSummary?: string;
};

const PATIENTS_KEY = "caresync.patients.v1";
const NOTES_KEY = "caresync.notes.v1";
const AUTH_KEY = "caresync.auth.v1";
const PROFILE_KEY_PREFIX = "caresync.profile.v1.";

const seedPatients: Patient[] = [
  { id: "p1", name: "Margaret Chen", age: 78, room: "204A", conditionSummary: "Post-op recovery" },
  { id: "p2", name: "Robert Alvarez", age: 82, room: "118B", conditionSummary: "Type 2 diabetes" },
  {
    id: "p3",
    name: "Eleanor Whitfield",
    age: 91,
    room: "302",
    conditionSummary: "Mobility assistance",
  },
];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getPatients(): Patient[] {
  const p = read<Patient[]>(PATIENTS_KEY, []);
  if (p.length === 0) {
    write(PATIENTS_KEY, seedPatients);
    return seedPatients;
  }
  return p;
}

export function addPatient(patient: Omit<Patient, "id">): Patient {
  const list = getPatients();
  const newP = { ...patient, id: `p${Date.now()}` };
  write(PATIENTS_KEY, [newP, ...list]);
  return newP;
}

export function getNotes(patientId?: string): Note[] {
  const all = read<Note[]>(NOTES_KEY, []);
  return patientId ? all.filter((n) => n.patientId === patientId) : all;
}

export function saveNote(note: Omit<Note, "id" | "createdAt">): Note {
  const all = read<Note[]>(NOTES_KEY, []);
  const newNote: Note = { ...note, id: `n${Date.now()}`, createdAt: Date.now() };
  write(NOTES_KEY, [newNote, ...all]);
  return newNote;
}

/* ---------------- auth ---------------- */
//
// Two paths:
//   * Cognito mode (VITE_COGNITO_* env vars present): real AWS Cognito User Pool.
//   * Mock mode (env vars missing): a localStorage-backed stub so `npm run dev`
//     keeps working before the Cognito stack is deployed.
//
// `getCurrentUser` and `signOut` are async so they work for both paths.

import * as cognito from "./cognito";

export type AuthUser = { email: string };

export const isCognitoConfigured = cognito.isCognitoConfigured;

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isCognitoConfigured) return cognito.getCurrentUser();
  return read<AuthUser | null>(AUTH_KEY, null);
}

export async function signOut(): Promise<void> {
  if (isCognitoConfigured) {
    try {
      await cognito.signOut();
    } catch {
      // Ignore — happens when there's no active Cognito session.
    }
  }
  if (typeof window !== "undefined") localStorage.removeItem(AUTH_KEY);
}

/** Mock-only sign-in. Used by the landing page when Cognito is NOT configured. */
export function mockSignIn(email: string) {
  write(AUTH_KEY, { email });
}

/* ---------------- user profile ---------------- */
//
// First-run onboarding captures who the user actually is (name, dob, role).
// Today the profile is stored in localStorage keyed by email so that two
// different signed-in users on the same device see their own data. When we
// add a backend or wire up Cognito custom attributes, swap the read/write
// helpers below — the rest of the app talks to this module through these
// function signatures.

export const OCCUPATIONS = [
  "caregiver",
  "rn",
  "lpn",
  "cna",
  "doctor",
  "physical-therapist",
  "occupational-therapist",
  "social-worker",
  "home-health-aide",
  "family-member",
  "student",
  "other",
] as const;

export type Occupation = (typeof OCCUPATIONS)[number];

export const OCCUPATION_LABELS: Record<Occupation, string> = {
  caregiver: "Caregiver",
  rn: "Registered Nurse (RN)",
  lpn: "Licensed Practical Nurse (LPN)",
  cna: "Certified Nursing Assistant (CNA)",
  doctor: "Doctor / Physician",
  "physical-therapist": "Physical Therapist",
  "occupational-therapist": "Occupational Therapist",
  "social-worker": "Social Worker",
  "home-health-aide": "Home Health Aide",
  "family-member": "Family Member",
  student: "Student / Trainee",
  other: "Other",
};

export type UserProfile = {
  firstName: string;
  lastName: string;
  /** ISO-8601 date of birth, format YYYY-MM-DD. Matches Cognito's standard
   * `birthdate` attribute so we can store + retrieve directly. Derived
   * `age` is computed on demand via `getAge(birthdate)` so it never goes
   * stale year over year. */
  birthdate: string;
  occupation: Occupation;
  createdAt: number;
};

/** Returns the user's age in whole years given an ISO YYYY-MM-DD birthdate.
 * Returns NaN for invalid input. */
export function getAge(birthdate: string): number {
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return Number.NaN;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/** ISO date string for the latest birthdate the form will accept — anyone
 * younger than this would be under 13, which we don't allow per COPPA-style
 * minimums. Recomputed each call so the bound moves with the calendar. */
export function maxAllowedBirthdate(): string {
  const t = new Date();
  t.setFullYear(t.getFullYear() - 13);
  return t.toISOString().slice(0, 10);
}

/** Lowest birthdate we accept. Effectively "no upper age limit" — anyone
 * born after 1900-01-01 is fine. */
export const MIN_ALLOWED_BIRTHDATE = "1900-01-01";

/** True for strings that look like a valid ISO YYYY-MM-DD calendar date in
 * the allowed range (between MIN_ALLOWED_BIRTHDATE and today - 13 years). */
export function isValidBirthdate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  // toISOString round-trip catches things like 2024-02-31 which Date will
  // happily coerce to March 2nd.
  if (d.toISOString().slice(0, 10) !== value) return false;
  return value >= MIN_ALLOWED_BIRTHDATE && value <= maxAllowedBirthdate();
}

function profileKey(email: string): string {
  return `${PROFILE_KEY_PREFIX}${email.toLowerCase()}`;
}

/** Synchronous cached read for instant first-paint. The header avatar / name
 * uses this so the dashboard can render without waiting on a network call.
 * Always paired with `getUserProfile()` in a useEffect that updates the
 * cache from Cognito. */
export function getCachedUserProfile(email: string): UserProfile | null {
  if (!email) return null;
  return read<UserProfile | null>(profileKey(email), null);
}

/** Authoritative read. Hits Cognito when configured; falls back to the
 * localStorage cache on network failure so the dashboard still works
 * offline. */
export async function getUserProfile(email: string): Promise<UserProfile | null> {
  if (!email) return null;
  if (isCognitoConfigured) {
    const remote = await cognito.fetchProfile();
    if (remote && OCCUPATIONS.includes(remote.occupation as Occupation)) {
      const cached = getCachedUserProfile(email);
      const profile: UserProfile = {
        firstName: remote.firstName,
        lastName: remote.lastName,
        birthdate: remote.birthdate,
        occupation: remote.occupation as Occupation,
        createdAt: cached?.createdAt ?? Date.now(),
      };
      write(profileKey(email), profile);
      return profile;
    }
    if (remote === null) {
      // Cognito reachable but no profile yet — treat as not-onboarded.
      return null;
    }
  }
  return getCachedUserProfile(email);
}

/** Save the profile. With Cognito configured we write to the pool first
 * (source of truth) then refresh the local cache; failures bubble up. */
export async function saveUserProfile(
  email: string,
  profile: Omit<UserProfile, "createdAt">,
): Promise<UserProfile> {
  if (isCognitoConfigured) {
    await cognito.updateProfile({
      firstName: profile.firstName,
      lastName: profile.lastName,
      birthdate: profile.birthdate,
      occupation: profile.occupation,
    });
  }
  const existing = getCachedUserProfile(email);
  const full: UserProfile = {
    ...profile,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  write(profileKey(email), full);
  return full;
}

export async function isProfileComplete(email: string): Promise<boolean> {
  const p = await getUserProfile(email);
  return Boolean(
    p &&
      p.firstName.trim() &&
      p.lastName.trim() &&
      isValidBirthdate(p.birthdate) &&
      OCCUPATIONS.includes(p.occupation),
  );
}

// Naive keyword categorizer to mock the AI/Lambda step
export function structureTranscript(text: string): StructuredNote {
  const lower = text.toLowerCase();
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const concernKeys = [
    "pain",
    "concern",
    "report",
    "complain",
    "discomfort",
    "fatigue",
    "dizzy",
    "nausea",
    "anxious",
  ];
  const careKeys = [
    "assist",
    "helped",
    "administered",
    "provided",
    "gave",
    "bath",
    "fed",
    "mobility",
    "walk",
    "medication",
    "med ",
  ];
  const statusKeys = [
    "vital",
    "stable",
    "alert",
    "oriented",
    "bp",
    "blood pressure",
    "temperature",
    "heart rate",
    "spo2",
  ];
  const followKeys = [
    "monitor",
    "follow",
    "reassess",
    "check",
    "next",
    "schedule",
    "notify",
    "inform",
  ];

  const pick = (keys: string[]) =>
    sentences.filter((s) => keys.some((k) => s.toLowerCase().includes(k))).join(" ");

  const concern = pick(concernKeys);
  const care = pick(careKeys);
  const status = pick(statusKeys);
  const follow = pick(followKeys);

  return {
    patientConcern: concern || (lower.includes("pain") ? "Patient reports discomfort." : ""),
    careProvided: care,
    patientStatus: status,
    followUpNeeded: follow,
  };
}
