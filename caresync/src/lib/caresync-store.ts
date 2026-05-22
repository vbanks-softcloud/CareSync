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

export function getAuth(): { email: string } | null {
  return read<{ email: string } | null>(AUTH_KEY, null);
}
export function signIn(email: string) {
  write(AUTH_KEY, { email });
}
export function signOut() {
  if (typeof window !== "undefined") localStorage.removeItem(AUTH_KEY);
}

// Naive keyword categorizer to mock the AI/Lambda step
export function structureTranscript(text: string): StructuredNote {
  const lower = text.toLowerCase();
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const concernKeys = ["pain", "concern", "report", "complain", "discomfort", "fatigue", "dizzy", "nausea", "anxious"];
  const careKeys = ["assist", "helped", "administered", "provided", "gave", "bath", "fed", "mobility", "walk", "medication", "med "];
  const statusKeys = ["vital", "stable", "alert", "oriented", "bp", "blood pressure", "temperature", "heart rate", "spo2"];
  const followKeys = ["monitor", "follow", "reassess", "check", "next", "schedule", "notify", "inform"];

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
