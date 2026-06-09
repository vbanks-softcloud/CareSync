export type StructuredNote = {
  patientConcern: string;
  careProvided: string;
  status: string;
  followUp: string;
};

export type Note = {
  id: string;
  patientId: string;
  createdAt: number;
  transcript: string;
  structured: StructuredNote;
};

export type Patient = {
  id: string;
  name: string;
  age: number;
  room?: string;
  condition?: string;
};

const PATIENTS_KEY = "caresync.patients.v1";
const NOTES_KEY = "caresync.notes.v1";
const AUTH_KEY = "caresync.auth.v1";

const seedPatients: Patient[] = [
  { id: "p1", name: "Margaret Chen", age: 78, room: "204A", condition: "Post-op recovery" },
  { id: "p2", name: "Robert Alvarez", age: 82, room: "118B", condition: "Type 2 diabetes" },
  { id: "p3", name: "Eleanor Whitfield", age: 91, room: "302", condition: "Mobility assistance" },
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
    status: status,
    followUp: follow,
  };
}
