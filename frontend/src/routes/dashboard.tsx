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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  Search,
  ArrowUpDown,
  X,
  Pencil,
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
  updatePatient,
  listNotes,
  createNote,
  updateNote,
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

type PatientSort = "recent" | "oldest" | "name-asc" | "name-desc" | "age-young" | "age-old";
type NoteSort = "newest" | "oldest";
type NotesScope = "patient" | "all";

// A note as rendered in the history list. patientName is only set when the
// user is in the cross-patient "all notes" view; in the single-patient view
// the column header already shows whose notes these are.
type DisplayNote = Note & { patientName?: string };

const PATIENT_SORT_LABELS: Record<PatientSort, string> = {
  recent: "Recently added",
  oldest: "Oldest first",
  "name-asc": "Name (A → Z)",
  "name-desc": "Name (Z → A)",
  "age-young": "Age (young → old)",
  "age-old": "Age (old → young)",
};

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
    miscellaneousNotes: "",
  });
  const [editableTranscript, setEditableTranscript] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [patientSheetOpen, setPatientSheetOpen] = useState(false);
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState("record");
  const [saving, setSaving] = useState(false);

  // Filter / sort state for the patient list (sidebar + mobile sheet).
  // Persisted only in memory — resets on page reload, which is fine.
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSort, setPatientSort] = useState<PatientSort>("recent");

  // Filter / sort state for the notes history tab.
  const [noteSearch, setNoteSearch] = useState("");
  const [noteSort, setNoteSort] = useState<NoteSort>("newest");
  const [notesOnlyFollowUp, setNotesOnlyFollowUp] = useState(false);

  // "patient" = notes for the currently selected patient only (default).
  // "all"     = notes aggregated across every patient the user owns.
  // The user enters "all" mode by tapping the mobile "Notes" stat tile or
  // the toggle inside the History tab; selecting a specific patient flips
  // it back to "patient".
  const [notesScope, setNotesScope] = useState<NotesScope>("patient");
  const [allNotes, setAllNotes] = useState<DisplayNote[] | null>(null);
  const [allNotesLoading, setAllNotesLoading] = useState(false);

  // The patient currently open in the EditPatientDialog (null = no dialog).
  // Stored as an id rather than the full patient object so the dialog always
  // sees the latest data after edits from another tab.
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);

  // The note currently open in the NoteDetailDialog. We store the full note
  // (not just the id) because notes can come from either the per-patient
  // `notes` list or the cross-patient `allNotes` cache, and unifying the
  // lookup is more code than it's worth.
  const [openNote, setOpenNote] = useState<DisplayNote | null>(null);

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

  // Aggregates notes from every patient when the user enters "all" scope.
  // Today we do this client-side with N parallel API calls — fine for the
  // typical caregiver workload (handful of patients). If/when this grows
  // into the hundreds, swap to a dedicated GET /api/notes endpoint that
  // joins server-side and returns one paginated response.
  useEffect(() => {
    if (notesScope !== "all") return;
    // Already loaded — don't refetch. Cache is invalidated by `handleSave`
    // and by adding a new patient, both of which clear allNotes back to null.
    if (allNotes !== null) return;
    if (patients.length === 0) {
      setAllNotes([]);
      return;
    }
    let cancelled = false;
    setAllNotesLoading(true);
    (async () => {
      try {
        const perPatient = await Promise.all(
          patients.map(async (p) => {
            const list = await listNotes(p.id);
            return list.map<DisplayNote>((n) => ({ ...n, patientName: p.name }));
          }),
        );
        if (cancelled) return;
        setAllNotes(perPatient.flat());
      } catch (err) {
        if (cancelled) return;
        toast.error("Couldn't load notes", { description: describeApiError(err) });
        setAllNotes([]);
      } finally {
        if (!cancelled) setAllNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notesScope, allNotes, patients]);

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

  // Apply search + sort to the patient list. We do this client-side because
  // we already loaded everything the user owns up-front; no extra round trips.
  const filteredPatients = useMemo(
    () => filterAndSortPatients(patients, patientSearch, patientSort),
    [patients, patientSearch, patientSort],
  );

  // The notes the History tab is currently rendering — either this patient's
  // notes, or everything aggregated. Null while "all" is still loading.
  const displayedNotes: DisplayNote[] | null = notesScope === "all" ? allNotes : notes;

  // Apply search + sort + follow-up filter on top of whichever list is shown.
  const filteredNotes = useMemo(
    () => filterAndSortNotes(displayedNotes ?? [], noteSearch, noteSort, notesOnlyFollowUp),
    [displayedNotes, noteSearch, noteSort, notesOnlyFollowUp],
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
      // Normalize free-text fields to sentence case before they're persisted
      // so the saved record reads cleanly regardless of how the user typed.
      const note = await createNote(selected.id, {
        transcript: capitalizeSentences(editableTranscript),
        patientConcern: capitalizeSentences(structured.patientConcern),
        careProvided: capitalizeSentences(structured.careProvided),
        patientStatus: capitalizeSentences(structured.patientStatus),
        followUpNeeded: capitalizeSentences(structured.followUpNeeded),
        miscellaneousNotes: capitalizeSentences(structured.miscellaneousNotes),
      });
      setNotes([note, ...notes]);
      // Invalidate the cross-patient cache so the new note shows up next
      // time the user flips to "All patients".
      setAllNotes(null);
      setEditableTranscript("");
      setStructured({
        patientConcern: "",
        careProvided: "",
        patientStatus: "",
        followUpNeeded: "",
        miscellaneousNotes: "",
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
    // Picking a specific patient implies you want to see their notes, not
    // the firehose of every note across every patient.
    setNotesScope("patient");
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
            <SheetContent side="left" className="flex w-[85vw] max-w-sm flex-col p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>Patients</SheetTitle>
              </SheetHeader>
              {/* Patient list takes all available space and scrolls; filters
                  and "Add patient" are pinned at the bottom so they're always
                  thumb-reachable on mobile. */}
              <div className="flex-1 overflow-y-auto p-3">
                <PatientList
                  patients={filteredPatients}
                  totalCount={patients.length}
                  selectedId={selectedId}
                  onSelect={selectPatient}
                />
              </div>
              <div className="space-y-3 border-t bg-card p-3">
                <PatientFilters
                  search={patientSearch}
                  onSearchChange={setPatientSearch}
                  sort={patientSort}
                  onSortChange={setPatientSort}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setPatientSheetOpen(false);
                    setShowAdd(true);
                  }}
                  // Brand primary is a warm rose — for this primary CTA we
                  // want a more saturated, unmistakable "red" so the user
                  // notices it at the bottom of the sheet.
                  className="w-full gap-1.5 bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
                >
                  <Plus className="h-4 w-4" /> Add patient
                </Button>
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
          <PatientFilters
            search={patientSearch}
            onSearchChange={setPatientSearch}
            sort={patientSort}
            onSortChange={setPatientSort}
          />
          <PatientList
            patients={filteredPatients}
            totalCount={patients.length}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
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
                <Stat
                  icon={Users}
                  label="Patients"
                  value={patients.length}
                  onClick={() => setPatientSheetOpen(true)}
                  ariaLabel={`Open patient list (${patients.length} patients)`}
                />
                <Stat
                  icon={FileText}
                  label="Notes"
                  value={notes.length}
                  onClick={() => {
                    setNotesScope("all");
                    setTab("history");
                  }}
                  ariaLabel="View notes from all patients"
                />
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
                {/* Active tab uses the brand red instead of the default white,
                    so users always know which step of the workflow they're on. */}
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger
                    value="record"
                    className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    <Mic className="h-3.5 w-3.5" /> Record
                  </TabsTrigger>
                  <TabsTrigger
                    value="review"
                    className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Review
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  >
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
                      autoCapitalize="sentences"
                      autoCorrect="on"
                      spellCheck
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
                      <FollowUpField
                        value={structured.followUpNeeded}
                        onChange={(v) => setStructured({ ...structured, followUpNeeded: v })}
                        placeholder="e.g. Monitor pain level next round."
                      />
                      <Field
                        label="Miscellaneous notes"
                        value={structured.miscellaneousNotes}
                        onChange={(v) => setStructured({ ...structured, miscellaneousNotes: v })}
                        placeholder="Anything else worth recording (family contact, equipment, scheduling, etc.)"
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
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-display text-base font-semibold sm:text-lg">
                        {notesScope === "all" ? "All notes" : "Notes history"}
                      </h3>
                      <Badge variant="secondary" className="ml-1">
                        {(() => {
                          const total = (displayedNotes ?? []).length;
                          return filteredNotes.length === total
                            ? total
                            : `${filteredNotes.length} / ${total}`;
                        })()}
                      </Badge>
                    </div>

                    {/* Scope toggle: this patient vs. all patients. We hide
                        it entirely when the user has only one patient — the
                        two views would be identical and the toggle is just
                        visual noise. */}
                    {patients.length > 1 && (
                      <div className="mb-4 inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs sm:text-sm">
                        <button
                          type="button"
                          onClick={() => setNotesScope("patient")}
                          className={`rounded-md px-3 py-1.5 font-medium transition ${
                            notesScope === "patient"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          This patient
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotesScope("all")}
                          className={`rounded-md px-3 py-1.5 font-medium transition ${
                            notesScope === "all"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          All patients
                        </button>
                      </div>
                    )}

                    {(displayedNotes?.length ?? 0) > 0 && (
                      <NoteFilters
                        search={noteSearch}
                        onSearchChange={setNoteSearch}
                        sort={noteSort}
                        onSortChange={setNoteSort}
                        onlyFollowUp={notesOnlyFollowUp}
                        onOnlyFollowUpChange={setNotesOnlyFollowUp}
                        className="mb-4"
                      />
                    )}

                    {(notesScope === "patient" ? notesLoading : allNotesLoading) ? (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {notesScope === "all"
                          ? "Loading notes from all patients…"
                          : "Loading notes…"}
                      </div>
                    ) : (displayedNotes?.length ?? 0) === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {notesScope === "all"
                          ? "No notes yet. Record one above."
                          : "No notes yet for this patient. Record one above."}
                      </p>
                    ) : filteredNotes.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        <p>No notes match your filters.</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1 h-auto p-0"
                          onClick={() => {
                            setNoteSearch("");
                            setNotesOnlyFollowUp(false);
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredNotes.map((n) => (
                          <NoteRow
                            key={n.id}
                            note={n}
                            onPatientClick={setEditingPatientId}
                            onOpen={(note) => {
                              // Always make sure the dialog has a patient
                              // name to display in its big red header. In
                              // the cross-patient "All notes" view this is
                              // already attached. In the single-patient
                              // view it isn't, so we look it up from the
                              // currently selected patient.
                              const withName: DisplayNote = note.patientName
                                ? note
                                : selected
                                  ? { ...note, patientName: selected.name }
                                  : note;
                              setOpenNote(withName);
                            }}
                          />
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

      {editingPatientId &&
        (() => {
          const target = patients.find((p) => p.id === editingPatientId);
          if (!target) return null;
          return (
            <EditPatientDialog
              patient={target}
              onClose={() => setEditingPatientId(null)}
              onSaved={(updated) => {
                // Patch the patient in the in-memory list so any view
                // (sidebar, header, all-notes) re-renders with new name.
                setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                // Refresh the patient name embedded in cached all-notes
                // entries; cheaper than refetching the whole list.
                if (allNotes) {
                  setAllNotes((prev) =>
                    prev
                      ? prev.map((n) =>
                          n.patientId === updated.id ? { ...n, patientName: updated.name } : n,
                        )
                      : prev,
                  );
                }
                setEditingPatientId(null);
              }}
            />
          );
        })()}

      {openNote && (
        <NoteDetailDialog
          note={openNote}
          onClose={() => setOpenNote(null)}
          onUpdated={(updated) => {
            // Preserve the patientName carry-over from the all-notes view —
            // the backend doesn't return it, so we re-attach it here.
            const patientName = openNote.patientName;
            const next: DisplayNote = patientName ? { ...updated, patientName } : updated;
            // Patch both the per-patient list and the cross-patient cache
            // so whichever view is currently rendering shows the update.
            setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
            if (allNotes) {
              setAllNotes((prev) => (prev ? prev.map((n) => (n.id === next.id ? next : n)) : prev));
            }
            setOpenNote(next);
          }}
        />
      )}
    </div>
  );
}

function PatientList({
  patients,
  totalCount,
  selectedId,
  onSelect,
}: {
  patients: Patient[];
  // Total count before filters were applied. Used to distinguish "no patients
  // at all" from "no patients match the current search".
  totalCount?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (patients.length === 0 && (totalCount ?? 0) > 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
        No patients match your search.
      </div>
    );
  }
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

function PatientFilters({
  search,
  onSearchChange,
  sort,
  onSortChange,
  className,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  sort: PatientSort;
  onSortChange: (v: PatientSort) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search patients by name"
          className="h-9 pl-8 text-sm"
        />
      </div>
      <Select value={sort} onValueChange={(v) => onSortChange(v as PatientSort)}>
        <SelectTrigger className="h-9 w-full text-sm" aria-label="Sort patients">
          <div className="flex items-center gap-2 truncate">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PATIENT_SORT_LABELS) as PatientSort[]).map((key) => (
            <SelectItem key={key} value={key}>
              {PATIENT_SORT_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NoteFilters({
  search,
  onSearchChange,
  sort,
  onSortChange,
  onlyFollowUp,
  onOnlyFollowUpChange,
  className,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  sort: NoteSort;
  onSortChange: (v: NoteSort) => void;
  onlyFollowUp: boolean;
  onOnlyFollowUpChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search transcripts, concerns, care…"
            aria-label="Search notes"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={sort} onValueChange={(v) => onSortChange(v as NoteSort)}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-44" aria-label="Sort notes by date">
            <div className="flex items-center gap-2 truncate">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          Only show notes with follow-up
        </span>
        <Switch checked={onlyFollowUp} onCheckedChange={onOnlyFollowUpChange} />
      </label>
    </div>
  );
}

function PatientHeader({ patient, noteCount }: { patient: Patient; noteCount: number }) {
  // Prefer the dynamically-computed age when we have a birthdate on file,
  // since the stored `age` was static at intake time and may now be stale.
  const computedAge = patient.birthdate ? ageFromBirthdate(patient.birthdate) : null;
  const displayedAge = computedAge ?? patient.age;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:gap-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-12 sm:w-12">
          <HeartPulse className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="font-display text-lg font-semibold leading-tight sm:text-2xl">
              {patient.name}
            </h1>
            {patient.birthdate && (
              <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs">
                {formatBirthdate(patient.birthdate)}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] sm:text-xs">
              {displayedAge} yrs
            </Badge>
            {patient.gender && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                {patient.gender}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
            Rm {patient.room ?? "—"} · {patient.conditionSummary ?? "General care"}
          </p>
        </div>
      </div>
      <Badge variant="secondary" className="gap-1">
        <ClipboardList className="h-3.5 w-3.5" /> {noteCount}
      </Badge>
    </Card>
  );
}

// Formats a YYYY-MM-DD birthdate as "MMM D, YYYY" without falling into the
// usual UTC-vs-local timezone trap — we slice the string parts directly so
// "1953-01-05" never accidentally renders as "Jan 4, 1953".
function formatBirthdate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Age in completed years from a YYYY-MM-DD birthdate. Uses the local
// "today" so the user's clock decides when someone has had their birthday
// rather than the server's UTC midnight.
function ageFromBirthdate(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBirthdayThisYear =
    now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

function Stat({
  icon: Icon,
  label,
  value,
  onClick,
  ariaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  // Optional — when provided, the whole tile becomes a real button with
  // hover/active states. When omitted, it renders as a static card.
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-card p-3 shadow-clinical transition hover:border-primary/40 hover:bg-accent/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </button>
    );
  }
  return <Card className="flex flex-col items-center justify-center gap-1 p-3">{content}</Card>;
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
        // Auto-capitalize on mobile keyboards — no-op on desktop, but the
        // on-save normalizer below handles desktop typing.
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        placeholder={placeholder}
        className="min-h-[64px] resize-none text-sm"
      />
    </div>
  );
}

/** Specialized Field for "Follow-up needed". A yes/no Switch controls
 * whether the textarea is shown. Toggling to "No" clears the value so
 * the saved note actually reflects "no follow-up", not stale text. */
function FollowUpField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  // Initial enabled state is derived from whether there's already text.
  // After mount we track it explicitly so the user can flip YES without
  // typing immediately and have the textbox stay open.
  const [enabled, setEnabled] = useState(value.trim().length > 0);

  const handleToggle = (v: boolean) => {
    setEnabled(v);
    if (!v) onChange("");
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <Label className="block text-xs uppercase tracking-wide text-muted-foreground">
          Follow-up needed
        </Label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <span className={enabled ? "text-muted-foreground" : "text-foreground"}>No</span>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
          <span className={enabled ? "text-foreground" : "text-muted-foreground"}>Yes</span>
        </label>
      </div>
      {enabled && (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          className="min-h-[64px] resize-none text-sm"
          autoFocus={value === ""}
        />
      )}
    </div>
  );
}

function NoteRow({
  note,
  onPatientClick,
  onOpen,
}: {
  note: DisplayNote;
  // Only invoked when the row is rendered with a patientName (i.e. inside
  // the cross-patient "All notes" view). Clicking opens the edit dialog
  // for that patient.
  onPatientClick?: (patientId: string) => void;
  // Opens the full-screen NoteDetailDialog for this note.
  onOpen?: (note: DisplayNote) => void;
}) {
  const date = new Date(note.createdAt);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(note)}
      className="block w-full rounded-lg border border-foreground/15 bg-card p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-primary/60 hover:bg-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
      aria-label="Open note details"
    >
      {/* Patient name is only shown when this row is being rendered inside
          the cross-patient "All patients" view; in single-patient mode the
          tab header already says whose notes these are. */}
      {note.patientName && (
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => {
            // Don't bubble — the outer row click would otherwise open the
            // note detail dialog instead of the patient editor.
            e.stopPropagation();
            onPatientClick?.(note.patientId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onPatientClick?.(note.patientId);
            }
          }}
          className="group -mx-1 mb-2 inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-base font-bold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg"
          aria-label={`Edit ${note.patientName}`}
          title="Click to edit patient"
        >
          <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="underline-offset-2 group-hover:underline">{note.patientName}</span>
        </span>
      )}
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
    </button>
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
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // When the user types a birthdate, pre-fill the age field with the
  // computed value (they can still override it for ages without a known
  // birthdate). We only do this while age is empty so we never stomp on a
  // value the user already typed.
  const handleBirthdateChange = (v: string) => {
    setBirthdate(v);
    if (v && !age) {
      const computed = ageFromBirthdate(v);
      if (computed !== null && computed >= 0 && computed <= 130) {
        setAge(String(computed));
      }
    }
  };

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
        birthdate: birthdate || undefined,
        gender: gender || undefined,
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
              <Label htmlFor="dob">Birthdate</Label>
              <Input
                id="dob"
                type="date"
                value={birthdate}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                onChange={(e) => handleBirthdateChange(e.target.value)}
              />
            </div>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g">Gender</Label>
              <GenderSelect value={gender} onChange={setGender} />
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

// Tiny gender picker — single source of truth for the option list, used by
// both AddPatientDialog and EditPatientDialog. Free text lives in the DB
// (VARCHAR), but the form constrains intake to a small known set so we
// don't end up with "Male", "male", "M", "Male." all in the same column.
const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"] as const;

function GenderSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm" aria-label="Gender">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {GENDER_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditPatientDialog({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: (p: Patient) => void;
}) {
  const [name, setName] = useState(patient.name);
  const [age, setAge] = useState(String(patient.age));
  const [room, setRoom] = useState(patient.room ?? "");
  const [condition, setCondition] = useState(patient.conditionSummary ?? "");
  const [birthdate, setBirthdate] = useState(patient.birthdate ?? "");
  const [gender, setGender] = useState(patient.gender ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleBirthdateChange = (v: string) => {
    setBirthdate(v);
    // Auto-sync age to whatever the new birthdate implies. We always run
    // this on edit (not just when age is empty like in AddPatient) because
    // here the user is actively reconciling stored demographics.
    if (v) {
      const computed = ageFromBirthdate(v);
      if (computed !== null && computed >= 0 && computed <= 130) {
        setAge(String(computed));
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !age) return;
    setSubmitting(true);
    try {
      // Send every field — the backend handles partial updates, but sending
      // the full set is simpler than diffing and is still tiny on the wire.
      const updated = await updatePatient(patient.id, {
        name,
        age: Number(age),
        room: room || undefined,
        conditionSummary: condition || undefined,
        birthdate: birthdate || undefined,
        gender: gender || undefined,
      });
      onSaved(updated);
      toast.success("Patient updated");
    } catch (err) {
      toast.error("Couldn't update patient", { description: describeApiError(err) });
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
        <h2 className="mb-4 font-display text-xl font-semibold">Edit patient</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-n">Name</Label>
            <Input id="edit-n" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-dob">Birthdate</Label>
              <Input
                id="edit-dob"
                type="date"
                value={birthdate}
                max={new Date().toISOString().slice(0, 10)}
                min="1900-01-01"
                onChange={(e) => handleBirthdateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-a">Age</Label>
              <Input
                id="edit-a"
                type="number"
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-g">Gender</Label>
              <GenderSelect value={gender} onChange={setGender} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-r">Room</Label>
              <Input id="edit-r" value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-c">Condition</Label>
            <Input id="edit-c" value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function NoteDetailDialog({
  note,
  onClose,
  onUpdated,
}: {
  note: DisplayNote;
  onClose: () => void;
  // Called after a successful PUT so the parent can patch its in-memory lists.
  onUpdated: (note: Note) => void;
}) {
  // The dialog has two modes: "view" (read-only summary) and "edit" (the
  // four structured fields + transcript become editable). Edit mode is
  // entered via the pencil icon in the header.
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [transcript, setTranscript] = useState(note.transcript);
  const [concern, setConcern] = useState(note.patientConcern ?? "");
  const [care, setCare] = useState(note.careProvided ?? "");
  const [status, setStatus] = useState(note.patientStatus ?? "");
  const [followUp, setFollowUp] = useState(note.followUpNeeded ?? "");
  const [misc, setMisc] = useState(note.miscellaneousNotes ?? "");
  const [saving, setSaving] = useState(false);

  const createdDate = new Date(note.createdAt);
  const formattedCreated = `${createdDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} · ${createdDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  // Source of truth for "has this note ever been edited?" is the per-field
  // *_edited_at columns (migrations 003 + 004). The most recent of those
  // is what we display in the top banner. We fall back to the whole-row
  // updated_at if for some reason none of the per-field columns are set
  // but updated_at is meaningfully newer than created_at — that case
  // covers rows edited before migration 003 landed.
  const perFieldStamps = [
    note.transcriptEditedAt,
    note.patientConcernEditedAt,
    note.careProvidedEditedAt,
    note.patientStatusEditedAt,
    note.followUpNeededEditedAt,
    note.miscellaneousNotesEditedAt,
  ].filter((s): s is string => Boolean(s));

  let editedIso: string | null = null;
  if (perFieldStamps.length > 0) {
    // ISO strings sort lexicographically the same as chronologically.
    editedIso = perFieldStamps.sort()[perFieldStamps.length - 1];
  } else if (new Date(note.updatedAt).getTime() - createdDate.getTime() > 2000) {
    editedIso = note.updatedAt;
  }

  const wasEdited = editedIso !== null;
  const formattedUpdated = editedIso
    ? (() => {
        const d = new Date(editedIso);
        return `${d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: d.getFullYear() === createdDate.getFullYear() ? undefined : "numeric",
        })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      })()
    : null;

  // Close on Escape — standard modal behavior, and means power users don't
  // have to hunt for the X button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateNote(note.patientId, note.id, {
        transcript: capitalizeSentences(transcript),
        patientConcern: capitalizeSentences(concern),
        careProvided: capitalizeSentences(care),
        patientStatus: capitalizeSentences(status),
        followUpNeeded: capitalizeSentences(followUp),
        miscellaneousNotes: capitalizeSentences(misc),
      });
      onUpdated(updated);
      setMode("view");
      toast.success("Note updated");
    } catch (err) {
      toast.error("Couldn't update note", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTranscript(note.transcript);
    setConcern(note.patientConcern ?? "");
    setCare(note.careProvided ?? "");
    setStatus(note.patientStatus ?? "");
    setFollowUp(note.followUpNeeded ?? "");
    setMisc(note.miscellaneousNotes ?? "");
    setMode("view");
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/50 p-0 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <Card
        // Fixed height (not max-height) on desktop so the inner flex column
        // has a defined size for `flex-1 + overflow-y-auto` to scroll inside.
        // `max-height` alone would let the card expand to fit content and
        // the body would never get a constrained height to scroll within.
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none p-0 shadow-clinical sm:h-[min(90vh,900px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Note details"
      >
        {/* Last-edited banner — sits at the very top of the dialog so the
            user immediately knows the note has been modified since it was
            first recorded. Hidden when the note has never been edited. */}
        {wasEdited && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 sm:px-6 sm:text-base">
            <Pencil className="h-4 w-4 shrink-0" />
            <span>
              Last edited <span className="font-semibold">{formattedUpdated}</span>
            </span>
          </div>
        )}

        {/* Header — title on the left, edit + close icons on the right. */}
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            {note.patientName && (
              <div className="mb-1 flex items-center gap-2 font-display text-xl font-bold text-primary sm:text-2xl">
                <HeartPulse className="h-5 w-5 sm:h-6 sm:w-6" />
                {note.patientName}
              </div>
            )}
            <p className="text-xs text-muted-foreground sm:text-sm">
              <span className="font-medium">Created</span> {formattedCreated}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {mode === "view" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMode("edit")}
                aria-label="Edit note"
                title="Edit note"
                className="h-9 w-9"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body — scrolls independently of the header/footer. `min-h-0` is
            the classic flex gotcha fix: without it, the flex child refuses
            to shrink below its content size and overflow-y-auto never kicks
            in. `relative` so the saving overlay can absolutely-position
            inside it. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {mode === "view" ? (
            <div className="space-y-5">
              <DetailBlock
                label="Transcript"
                value={note.transcript}
                monospace
                editedAt={note.transcriptEditedAt}
              />
              <DetailBlock
                label="Patient concern"
                value={note.patientConcern}
                editedAt={note.patientConcernEditedAt}
              />
              <DetailBlock
                label="Care provided"
                value={note.careProvided}
                editedAt={note.careProvidedEditedAt}
              />
              <DetailBlock
                label="Patient status"
                value={note.patientStatus}
                editedAt={note.patientStatusEditedAt}
              />
              <DetailBlock
                label="Follow-up needed"
                value={note.followUpNeeded}
                emptyText="No follow-up needed."
                editedAt={note.followUpNeededEditedAt}
              />
              <DetailBlock
                label="Miscellaneous notes"
                value={note.miscellaneousNotes}
                editedAt={note.miscellaneousNotesEditedAt}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-note-transcript" className="text-xs uppercase tracking-wide">
                  Transcript
                </Label>
                <Textarea
                  id="edit-note-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck
                  rows={6}
                  className="text-sm"
                />
              </div>
              <Field
                label="Patient concern"
                value={concern}
                onChange={setConcern}
                placeholder="e.g. Mild left-leg pain reported."
              />
              <Field
                label="Care provided"
                value={care}
                onChange={setCare}
                placeholder="e.g. Assisted with mobility to restroom."
              />
              <Field
                label="Status"
                value={status}
                onChange={setStatus}
                placeholder="e.g. Vital signs stable."
              />
              <FollowUpField
                value={followUp}
                onChange={setFollowUp}
                placeholder="e.g. Monitor pain level next round."
              />
              <Field
                label="Miscellaneous notes"
                value={misc}
                onChange={setMisc}
                placeholder="Anything else worth recording (family contact, equipment, scheduling, etc.)"
              />
            </div>
          )}

          {/* Saving overlay — sits on top of the body content while a save
              is in flight so the spinner is impossible to miss. The body
              underneath is already non-interactive (Save button disabled,
              inputs blocked by pointer-events-none below). */}
          {saving && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/70 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="font-display text-base font-semibold text-foreground sm:text-lg">
                Saving changes…
              </div>
            </div>
          )}
        </div>

        {/* Footer — only present in edit mode. */}
        {mode === "edit" && (
          <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={handleCancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save changes
                </>
              )}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function DetailBlock({
  label,
  value,
  monospace,
  emptyText = "Not recorded.",
  editedAt,
}: {
  label: string;
  value: string | null | undefined;
  monospace?: boolean;
  // Override the default "Not recorded." placeholder. Useful for fields
  // where empty has a domain-specific meaning (e.g. follow-up needed →
  // "No follow-up needed").
  emptyText?: string;
  // ISO timestamp of the last time this specific field was edited. null
  // means it's been untouched since the note was created — in which case
  // we don't show a badge.
  editedAt?: string | null;
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="font-display text-base font-bold uppercase tracking-wide text-foreground sm:text-lg">
          {label}
        </div>
        {editedAt && (
          <div className="text-xs italic text-amber-700 sm:text-sm">
            <Pencil className="-mt-0.5 mr-1 inline h-3 w-3" />
            Edited {formatShortStamp(editedAt)}
          </div>
        )}
      </div>
      {value && value.trim() ? (
        <div
          className={`whitespace-pre-wrap leading-relaxed ${
            monospace ? "font-mono text-sm sm:text-base" : "text-base sm:text-lg"
          }`}
        >
          {value}
        </div>
      ) : (
        <div className="text-base italic text-muted-foreground sm:text-lg">{emptyText}</div>
      )}
    </div>
  );
}

// Compact timestamp formatter for the per-field "edited" badges. Drops the
// year when it matches today's year so the badge stays short.
function formatShortStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** Normalizes free-text to sentence case before it's saved to the backend.
 * - Trims surrounding whitespace.
 * - Capitalizes the first letter of the text.
 * - Capitalizes the first letter after a sentence-ending punctuation mark
 *   followed by whitespace.
 *
 * Intentionally only touches LETTERS that come after a known boundary, so
 * proper nouns and acronyms the user typed mid-sentence are left alone. We
 * apply this at save time (not on every keystroke) so we never fight the
 * user while they're typing. */
function capitalizeSentences(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const firstUpped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return firstUpped.replace(
    /([.!?]\s+)([a-z])/g,
    (_match, prefix: string, letter: string) => prefix + letter.toUpperCase(),
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

// Sorts and filters the patient list on the client. We have the full list
// in memory already (one round trip on dashboard mount), so doing this here
// avoids server churn and keeps the typing-into-the-search-box latency
// at "react re-render" instead of "round trip to Lambda".
function filterAndSortPatients(patients: Patient[], search: string, sort: PatientSort): Patient[] {
  const q = search.trim().toLowerCase();
  const filtered = q ? patients.filter((p) => p.name.toLowerCase().includes(q)) : patients.slice();
  switch (sort) {
    case "recent":
      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "oldest":
      filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "name-asc":
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      filtered.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "age-young":
      filtered.sort((a, b) => a.age - b.age);
      break;
    case "age-old":
      filtered.sort((a, b) => b.age - a.age);
      break;
  }
  return filtered;
}

// Same idea for notes — search across all the text fields the user has
// access to (transcript + structured fields + patient name when in "all
// patients" mode) so they can find a specific note from days ago without
// scrolling.
function filterAndSortNotes(
  notes: DisplayNote[],
  search: string,
  sort: NoteSort,
  onlyFollowUp: boolean,
): DisplayNote[] {
  const q = search.trim().toLowerCase();
  let filtered = notes;
  if (q) {
    filtered = filtered.filter((n) => {
      const hay = [
        n.transcript,
        n.patientConcern,
        n.careProvided,
        n.patientStatus,
        n.followUpNeeded,
        n.patientName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (onlyFollowUp) {
    filtered = filtered.filter((n) => (n.followUpNeeded ?? "").trim().length > 0);
  }
  filtered = filtered.slice();
  filtered.sort((a, b) =>
    sort === "newest"
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt),
  );
  return filtered;
}
