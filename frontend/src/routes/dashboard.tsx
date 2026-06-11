import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  Users,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  type Patient,
  type Note,
  type StructuredNote,
  type AuthUser,
  type UserProfile,
  listPatients,
  createPatient,
  listNotes,
  createNote,
  structureTranscript,
  getCurrentUser,
  getCachedUserProfile,
  getUserProfile,
  signOut,
} from "@/lib/caresync-store";
import { ApiError } from "@/lib/api";
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
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [structured, setStructured] = useState<StructuredNote>({
    patientConcern: "",
    careProvided: "",
    patientStatus: "",
    followUpNeeded: "",
  });
  const [editableTranscript, setEditableTranscript] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [patientSheetOpen, setPatientSheetOpen] = useState(false);
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState("record");
  const [saving, setSaving] = useState(false);

  const speech = useSpeechRecognition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await getCurrentUser();
      if (cancelled) return;
      if (!a) {
        navigate({ to: "/" });
        return;
      }
      // Optimistic render: paint the header with whatever the local cache
      // last knew so the screen doesn't flash with a raw email while we
      // round-trip to Cognito for the real attributes.
      const cached = getCachedUserProfile(a.email);
      if (cached) {
        setAuth(a);
        setProfile(cached);
      }
      // First-run onboarding gate: new users (and returning users we've
      // never seen on this device) get bounced to /onboarding until the
      // profile in Cognito is complete.
      const fresh = await getUserProfile(a.email);
      if (cancelled) return;
      const complete = Boolean(
        fresh && fresh.firstName.trim() && fresh.lastName.trim() && fresh.birthdate,
      );
      if (!complete) {
        navigate({ to: "/onboarding" });
        return;
      }
      setAuth(a);
      setProfile(fresh);

      // Load patients from the API. Empty list is the normal new-account
      // state; the UI shows an "Add your first patient" empty state.
      try {
        const list = await listPatients();
        if (cancelled) return;
        setPatients(list);
        setSelectedId(list[0]?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        toast.error("Couldn't load patients", { description: describeApiError(err) });
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Reload notes whenever the selected patient changes. We don't cache
  // across switches because the list is cheap (indexed query) and we want
  // fresh data after another caregiver writes a note.
  useEffect(() => {
    if (!selectedId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotesLoading(true);
    (async () => {
      try {
        const list = await listNotes(selectedId);
        if (cancelled) return;
        setNotes(list);
      } catch (err) {
        if (cancelled) return;
        toast.error("Couldn't load notes", { description: describeApiError(err) });
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    setTab("review");
    toast.success("Note structured", { description: "Review and edit before saving." });
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!editableTranscript.trim()) {
      toast.error("Add a transcript first.");
      return;
    }
    setSaving(true);
    try {
      const note = await createNote(selected.id, {
        transcript: editableTranscript.trim(),
        patientConcern: structured.patientConcern,
        careProvided: structured.careProvided,
        patientStatus: structured.patientStatus,
        followUpNeeded: structured.followUpNeeded,
      });
      setNotes([note, ...notes]);
      setEditableTranscript("");
      setStructured({
        patientConcern: "",
        careProvided: "",
        patientStatus: "",
        followUpNeeded: "",
      });
      speech.reset();
      setTab("history");
      toast.success("Note saved", { description: "Encrypted and added to patient record." });
    } catch (err) {
      toast.error("Couldn't save note", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const selectPatient = (id: string) => {
    setSelectedId(id);
    setPatientSheetOpen(false);
  };

  if (!auth) return null;

  // Prefer the user's actual name once onboarding is done; fall back to email
  // characters so the avatar always has something readable.
  const displayName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : auth.email;
  const initials = profile
    ? `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase() ||
      auth.email.slice(0, 2).toUpperCase()
    : auth.email.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <Toaster richColors position="top-center" />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-semibold leading-tight sm:text-base">
              CareSync
            </div>
            <div className="truncate text-[11px] text-muted-foreground sm:text-xs">
              {displayName}
            </div>
          </div>

          {/* Mobile patient switcher */}
          <Sheet open={patientSheetOpen} onOpenChange={setPatientSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 lg:hidden">
                <Users className="h-4 w-4" />
                <span className="hidden xs:inline">Patients</span>
                <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px]">
                  {patients.length}
                </Badge>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>Patients</SheetTitle>
              </SheetHeader>
              <div className="p-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPatientSheetOpen(false);
                    setShowAdd(true);
                  }}
                  className="mb-3 w-full gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add patient
                </Button>
                <PatientList patients={patients} selectedId={selectedId} onSelect={selectPatient} />
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-9 w-9"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <Link
            to="/profile"
            className="bg-accent text-accent-foreground hover:bg-accent/80 focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="Edit profile"
            title="Edit profile"
          >
            {initials}
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden space-y-3 lg:block">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Patients
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAdd(true)}
              className="h-7 gap-1 px-2"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <PatientList patients={patients} selectedId={selectedId} onSelect={setSelectedId} />
        </aside>

        <main className="space-y-4 sm:space-y-6">
          {patientsLoading ? (
            <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading patients…
            </Card>
          ) : selected ? (
            <>
              <PatientHeader patient={selected} noteCount={notes.length} />

              {/* Quick stats — mobile-only. We used to show a "Total notes
                  across all patients" tile, but with the API that needs a
                  per-patient query each. Dropped until we have a stats
                  endpoint that aggregates server-side. */}
              <div className="grid grid-cols-2 gap-2 lg:hidden">
                <Stat icon={Users} label="Patients" value={patients.length} />
                <Stat icon={FileText} label="Notes" value={notes.length} />
              </div>

              {/* One-tap add-patient affordance for mobile. Desktop already
                  exposes this through the sidebar's "+ Add" button, so this
                  row is hidden at lg+. Putting it directly above the tabs
                  keeps the action in the user's focus without competing
                  with the patient context above. */}
              <Button
                variant="outline"
                onClick={() => setShowAdd(true)}
                className="w-full gap-2 lg:hidden"
              >
                <Plus className="h-4 w-4" /> Add patient
              </Button>

              {/* Tabbed workflow */}
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="record" className="gap-1.5 text-xs sm:text-sm">
                    <Mic className="h-3.5 w-3.5" /> Record
                  </TabsTrigger>
                  <TabsTrigger value="review" className="gap-1.5 text-xs sm:text-sm">
                    <Sparkles className="h-3.5 w-3.5" /> Review
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
                    <History className="h-3.5 w-3.5" /> History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="record" className="mt-4">
                  <Card className="p-4 sm:p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-semibold sm:text-lg">
                          Voice recording
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {speech.supported
                            ? "Live transcription via your browser."
                            : "Type the note below."}
                        </p>
                      </div>
                      {speech.listening && (
                        <Badge className="shrink-0 gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                          REC
                        </Badge>
                      )}
                    </div>

                    {/* Big mobile record button */}
                    <div className="mb-4 flex flex-col items-center gap-3 rounded-xl border bg-accent/30 p-5 sm:flex-row sm:justify-between sm:p-4">
                      <div className="text-center sm:text-left">
                        <div className="text-sm font-medium">
                          {speech.listening ? "Listening…" : "Ready to record"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {speech.listening ? "Tap stop when done" : "Tap the mic to start"}
                        </div>
                      </div>
                      {!speech.listening ? (
                        <Button
                          onClick={speech.start}
                          disabled={!speech.supported}
                          size="lg"
                          className="h-16 w-16 shrink-0 rounded-full p-0 shadow-lg sm:h-12 sm:w-auto sm:rounded-md sm:px-6"
                        >
                          <Mic className="h-6 w-6 sm:mr-2 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">Start</span>
                        </Button>
                      ) : (
                        <Button
                          onClick={speech.stop}
                          variant="destructive"
                          size="lg"
                          className="h-16 w-16 shrink-0 rounded-full p-0 shadow-lg sm:h-12 sm:w-auto sm:rounded-md sm:px-6"
                        >
                          <Square className="h-6 w-6 sm:mr-2 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">Stop</span>
                        </Button>
                      )}
                    </div>

                    {speech.error && (
                      <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {speech.error}
                      </div>
                    )}

                    <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
                      Transcript
                    </Label>
                    <Textarea
                      value={editableTranscript + (speech.interim ? ` ${speech.interim}` : "")}
                      onChange={(e) => setEditableTranscript(e.target.value)}
                      placeholder="Press record or type the care note here…"
                      className="min-h-[160px] resize-none font-mono text-sm leading-relaxed sm:min-h-[180px]"
                    />

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Button onClick={handleStructure} className="w-full gap-2 sm:w-auto">
                        <Sparkles className="h-4 w-4" /> Structure note
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          speech.reset();
                          setEditableTranscript("");
                        }}
                        className="w-full sm:w-auto"
                      >
                        Clear
                      </Button>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="review" className="mt-4">
                  <Card className="p-4 sm:p-5">
                    <div className="mb-4">
                      <h3 className="font-display text-base font-semibold sm:text-lg">
                        Structured note
                      </h3>
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
                        value={structured.patientStatus}
                        onChange={(v) => setStructured({ ...structured, patientStatus: v })}
                        placeholder="e.g. Vital signs stable."
                      />
                      <Field
                        label="Follow-up needed"
                        value={structured.followUpNeeded}
                        onChange={(v) => setStructured({ ...structured, followUpNeeded: v })}
                        placeholder="e.g. Monitor pain level next round."
                      />
                    </div>
                    <Separator className="my-5" />
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full gap-2"
                      size="lg"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" /> Save note to record
                        </>
                      )}
                    </Button>
                  </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <Card className="p-4 sm:p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-display text-base font-semibold sm:text-lg">
                        Notes history
                      </h3>
                      <Badge variant="secondary" className="ml-1">
                        {notes.length}
                      </Badge>
                    </div>
                    {notesLoading ? (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading notes…
                      </div>
                    ) : notes.length === 0 ? (
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
                </TabsContent>
              </Tabs>
            </>
          ) : patients.length === 0 ? (
            <Card className="p-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <h2 className="font-display text-lg font-semibold">No patients yet</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Add your first patient to start recording care notes.
              </p>
              <Button onClick={() => setShowAdd(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Add patient
              </Button>
            </Card>
          ) : (
            <Card className="p-10 text-center text-muted-foreground">
              Select a patient from the sidebar to begin.
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

function PatientList({
  patients,
  selectedId,
  onSelect,
}: {
  patients: Patient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {patients.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition active:scale-[0.99] ${
              active
                ? "border-primary/40 bg-accent text-accent-foreground shadow-clinical"
                : "bg-card hover:border-primary/30 hover:bg-accent/50"
            }`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                Age {p.age} · Rm {p.room ?? "—"}
              </div>
            </div>
            {active && <div className="ml-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function PatientHeader({ patient, noteCount }: { patient: Patient; noteCount: number }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:gap-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12">
          <HeartPulse className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-semibold leading-tight sm:text-2xl">
            {patient.name}
          </h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            Age {patient.age} · Rm {patient.room ?? "—"} ·{" "}
            {patient.conditionSummary ?? "General care"}
          </p>
        </div>
      </div>
      <Badge variant="secondary" className="gap-1">
        <ClipboardList className="h-3.5 w-3.5" /> {noteCount}
      </Badge>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-1 p-3">
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
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
    <div className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {date.toLocaleDateString()} ·{" "}
          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <Badge variant="secondary" className="text-[10px]">
          Saved
        </Badge>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {note.patientConcern && <Bit label="Concern" value={note.patientConcern} />}
        {note.careProvided && <Bit label="Care" value={note.careProvided} />}
        {note.patientStatus && <Bit label="Status" value={note.patientStatus} />}
        {note.followUpNeeded && <Bit label="Follow-up" value={note.followUpNeeded} />}
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
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !age) return;
    setSubmitting(true);
    try {
      const p = await createPatient({
        name,
        age: Number(age),
        room: room || undefined,
        conditionSummary: condition || undefined,
      });
      onAdded(p);
    } catch (err) {
      toast.error("Couldn't add patient", { description: describeApiError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md rounded-b-none rounded-t-2xl p-6 shadow-clinical sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Adding…" : "Add patient"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Pulls a human-readable error message out of an ApiError (or a regular
 * Error). Used by every toast.error() call in this file. */
function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Your session expired — please sign in again.";
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status === 404) return "Not found.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
