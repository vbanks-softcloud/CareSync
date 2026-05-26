import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Mic,
  Square,
  Save,
  Plus,
  LogOut,
  Stethoscope,
  Sparkles,
  History,
  AlertTriangle,
  HeartPulse,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  type Patient,
  type Note,
  type StructuredNote,
  getPatients,
  addPatient,
  getNotes,
  saveNote,
  structureTranscript,
  getAuth,
  signOut,
} from "@/lib/caresync-store";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard — CareSync" },
      { name: "description", content: "Record, structure, and save patient care notes." },
    ],
  }),
});

function Dashboard() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [structured, setStructured] = useState<StructuredNote>({
    patientConcern: "",
    careProvided: "",
    status: "",
    followUp: "",
  });
  const [editableTranscript, setEditableTranscript] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [auth, setAuth] = useState<{ email: string } | null>(null);

  const speech = useSpeechRecognition();

  useEffect(() => {
    const a = getAuth();
    if (!a) {
      navigate({ to: "/" });
      return;
    }
    setAuth(a);
    const p = getPatients();
    setPatients(p);
    setSelectedId(p[0]?.id ?? null);
  }, [navigate]);

  useEffect(() => {
    if (selectedId) setNotes(getNotes(selectedId));
  }, [selectedId]);

  useEffect(() => {
    setEditableTranscript(speech.transcript);
  }, [speech.transcript]);

  const selected = useMemo(
    () => patients.find((p) => p.id === selectedId) ?? null,
    [patients, selectedId],
  );

  const handleStructure = () => {
    const text = editableTranscript.trim();
    if (!text) {
      toast.error("Nothing to structure yet.");
      return;
    }
    setStructured(structureTranscript(text));
    toast.success("Note structured", { description: "Review and edit before saving." });
  };

  const handleSave = () => {
    if (!selected) return;
    if (!editableTranscript.trim()) {
      toast.error("Add a transcript first.");
      return;
    }
    const note = saveNote({
      patientId: selected.id,
      transcript: editableTranscript.trim(),
      structured,
    });
    setNotes([note, ...notes]);
    setEditableTranscript("");
    setStructured({ patientConcern: "", careProvided: "", status: "", followUp: "" });
    speech.reset();
    toast.success("Note saved", { description: "Encrypted and added to patient record." });
  };

  const handleLogout = () => {
    signOut();
    navigate({ to: "/" });
  };

  if (!auth) return null;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display font-semibold leading-tight">CareSync</div>
              <div className="text-xs text-muted-foreground">{auth.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[280px_1fr]">
        <PatientPanel
          patients={patients}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddClick={() => setShowAdd(true)}
        />

        <main className="space-y-6">
          {selected ? (
            <>
              <PatientHeader patient={selected} noteCount={notes.length} />

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-lg font-semibold">Voice recording</h3>
                      <p className="text-xs text-muted-foreground">
                        {speech.supported
                          ? "Live transcription powered by your browser."
                          : "Browser doesn't support live transcription — type below."}
                      </p>
                    </div>
                    {speech.listening && (
                      <Badge className="gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/10">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                        Recording
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!speech.listening ? (
                      <Button onClick={speech.start} disabled={!speech.supported} className="gap-2">
                        <Mic className="h-4 w-4" /> Start recording
                      </Button>
                    ) : (
                      <Button onClick={speech.stop} variant="destructive" className="gap-2">
                        <Square className="h-4 w-4" /> Stop
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleStructure} className="gap-2">
                      <Sparkles className="h-4 w-4" /> Structure note
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        speech.reset();
                        setEditableTranscript("");
                      }}
                    >
                      Clear
                    </Button>
                  </div>

                  {speech.error && (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5" /> {speech.error}
                    </div>
                  )}

                  <Separator className="my-4" />

                  <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                    Transcript
                  </Label>
                  <Textarea
                    value={editableTranscript + (speech.interim ? ` ${speech.interim}` : "")}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    placeholder="Press Start recording or type the care note here…"
                    className="min-h-[180px] resize-none font-mono text-sm leading-relaxed"
                  />
                </Card>

                <Card className="p-5">
                  <div className="mb-4">
                    <h3 className="font-display text-lg font-semibold">Structured note</h3>
                    <p className="text-xs text-muted-foreground">Review and edit each section.</p>
                  </div>
                  <div className="space-y-4">
                    <Field
                      label="Patient concern"
                      value={structured.patientConcern}
                      onChange={(v) => setStructured({ ...structured, patientConcern: v })}
                      placeholder="e.g. Mild left-leg pain reported."
                    />
                    <Field
                      label="Care provided"
                      value={structured.careProvided}
                      onChange={(v) => setStructured({ ...structured, careProvided: v })}
                      placeholder="e.g. Assisted with mobility to restroom."
                    />
                    <Field
                      label="Status"
                      value={structured.status}
                      onChange={(v) => setStructured({ ...structured, status: v })}
                      placeholder="e.g. Vital signs stable."
                    />
                    <Field
                      label="Follow-up needed"
                      value={structured.followUp}
                      onChange={(v) => setStructured({ ...structured, followUp: v })}
                      placeholder="e.g. Monitor pain level next round."
                    />
                  </div>
                  <Separator className="my-5" />
                  <Button onClick={handleSave} className="w-full gap-2">
                    <Save className="h-4 w-4" /> Save note to record
                  </Button>
                </Card>
              </div>

              <Card className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-display text-lg font-semibold">Notes history</h3>
                  <Badge variant="secondary" className="ml-1">
                    {notes.length}
                  </Badge>
                </div>
                {notes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No notes yet for this patient. Record one above.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {notes.map((n) => (
                      <NoteRow key={n.id} note={n} />
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card className="p-10 text-center text-muted-foreground">
              Select or add a patient to begin.
            </Card>
          )}
        </main>
      </div>

      {showAdd && (
        <AddPatientDialog
          onClose={() => setShowAdd(false)}
          onAdded={(p) => {
            setPatients([p, ...patients]);
            setSelectedId(p.id);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function PatientPanel({
  patients,
  selectedId,
  onSelect,
  onAddClick,
}: {
  patients: Patient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: () => void;
}) {
  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Patients
        </h2>
        <Button size="sm" variant="ghost" onClick={onAddClick} className="h-7 gap-1 px-2">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-1.5">
        {patients.map((p) => {
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`group flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                active
                  ? "border-primary/40 bg-accent text-accent-foreground shadow-clinical"
                  : "bg-card hover:border-primary/30 hover:bg-accent/50"
              }`}
            >
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  Age {p.age} · Rm {p.room ?? "—"}
                </div>
              </div>
              <ArrowRight
                className={`h-4 w-4 transition ${active ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function PatientHeader({ patient, noteCount }: { patient: Patient; noteCount: number }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HeartPulse className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold leading-tight">{patient.name}</h1>
          <p className="text-sm text-muted-foreground">
            Age {patient.age} · Room {patient.room ?? "—"} · {patient.condition ?? "General care"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary" className="gap-1">
          <ClipboardList className="h-3.5 w-3.5" /> {noteCount} notes
        </Badge>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[64px] resize-none text-sm"
      />
    </div>
  );
}

function NoteRow({ note }: { note: Note }) {
  const date = new Date(note.createdAt);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {date.toLocaleDateString()} ·{" "}
          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <Badge variant="secondary" className="text-xs">
          Saved
        </Badge>
      </div>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        {note.structured.patientConcern && (
          <Bit label="Concern" value={note.structured.patientConcern} />
        )}
        {note.structured.careProvided && <Bit label="Care" value={note.structured.careProvided} />}
        {note.structured.status && <Bit label="Status" value={note.structured.status} />}
        {note.structured.followUp && <Bit label="Follow-up" value={note.structured.followUp} />}
      </div>
    </div>
  );
}

function Bit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm leading-snug">{value}</div>
    </div>
  );
}

function AddPatientDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (p: Patient) => void;
}) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [room, setRoom] = useState("");
  const [condition, setCondition] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !age) return;
    const p = addPatient({ name, age: Number(age), room, condition });
    onAdded(p);
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card className="w-full max-w-md p-6 shadow-clinical" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-xl font-semibold">Add patient</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="n">Name</Label>
            <Input id="n" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="a">Age</Label>
              <Input
                id="a"
                type="number"
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r">Room</Label>
              <Input id="r" value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c">Condition</Label>
            <Input id="c" value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add patient</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
