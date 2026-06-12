import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserAvatar } from "@/components/user-avatar";
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
import followUpHandUrl from "@/assets/follow-up-hand.png";
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

// A note as rendered in the history list. The patient-* fields are
// attached at open time so the NoteDetailDialog can show demographics in
// its header without doing its own lookup. In the single-patient history
// view we set them from `selected`; in the cross-patient "all notes" view
// the aggregator attaches them per row.
type DisplayNote = Note & {
  patientName?: string;
  patientAge?: number;
  patientGender?: string | null;
  patientBirthdate?: string | null;
};

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
  // Whether the user has flagged this new note as needing follow-up.
  // Kept separate from `structured.followUpNeeded` so toggle-YES + empty
  // text is a distinguishable state from toggle-NO; the save handler
  // substitutes FOLLOW_UP_DEFAULT only when this is true and the text
  // is empty.
  const [followUpEnabledNew, setFollowUpEnabledNew] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [patientSheetOpen, setPatientSheetOpen] = useState(false);
  // Controls the "Are you sure you want to sign out?" confirmation. The
  // Sign out button just opens the dialog; the actual signOut + redirect
  // runs from the dialog's confirm action.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState("record");
  const [saving, setSaving] = useState(false);

  // Filter / sort state for the patient list (sidebar + mobile sheet).
  // Persisted only in memory — resets on page reload, which is fine.
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSort, setPatientSort] = useState<PatientSort>("recent");
  // "Only show patients with follow-up" toggle on the patient list.
  // Filter is applied AFTER `filterAndSortPatients` so it composes with
  // the existing search / sort without touching that pure utility.
  const [patientOnlyFollowUp, setPatientOnlyFollowUp] = useState(false);

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

  // Stable key derived from the current patient set. Used as the cache
  // signature for the cross-patient notes load below so we can tell
  // "we've already fetched for this exact cohort" apart from "we
  // happen to have an empty array because patients hadn't loaded yet".
  const patientIdKey = useMemo(
    () =>
      patients
        .map((p) => p.id)
        .sort()
        .join("|"),
    [patients],
  );
  const allNotesLoadedKey = useRef<string | null>(null);

  // Aggregates notes from every patient. Originally gated on
  // `notesScope === "all"` (only loaded when the user opened the
  // cross-patient History view), but the patient list also needs per-
  // patient note counts so each name in the sidebar / sliding sheet can
  // show "N notes" alongside it — for that we need the data up front.
  //
  // Concurrency: we batch in groups of ALL_NOTES_FETCH_CONCURRENCY to
  // avoid exhausting the backend account's Lambda concurrent-execution
  // budget. A naive `Promise.all(patients.map(listNotes))` issues N
  // parallel calls; on dev accounts where the per-account Lambda
  // concurrency limit is still the new-account default of 10, more
  // than ~10 patients reliably tripped throttling and the user saw a
  // 503 "Service Unavailable" toast. Batching to 3 keeps the
  // wall-clock cost roughly the same (each call is a few hundred ms)
  // while staying well under the limit no matter how many patients a
  // caregiver has. Long-term fix is a server-side batch endpoint —
  // tracked in the TODO above the function.
  const ALL_NOTES_FETCH_CONCURRENCY = 3;
  useEffect(() => {
    // Cache hit: we already loaded the notes for this exact patient set
    // AND haven't been manually invalidated (setAllNotes(null)). Earlier
    // versions short-circuited on `allNotes !== null`, which had a
    // subtle bug — on first mount with `patients === []`, the effect set
    // `allNotes = []` and then the early-return blocked the real fetch
    // once `listPatients()` populated `patients`. Keying the cache on
    // `patientIdKey` instead fixes that: an empty-patients load doesn't
    // satisfy the cache for the post-load patient set.
    if (allNotesLoadedKey.current === patientIdKey && allNotes !== null) return;

    if (patients.length === 0) {
      allNotesLoadedKey.current = patientIdKey;
      setAllNotes([]);
      return;
    }
    let cancelled = false;
    setAllNotesLoading(true);
    (async () => {
      try {
        const perPatient: DisplayNote[][] = [];
        for (let i = 0; i < patients.length; i += ALL_NOTES_FETCH_CONCURRENCY) {
          if (cancelled) return;
          const slice = patients.slice(i, i + ALL_NOTES_FETCH_CONCURRENCY);
          const chunk = await Promise.all(
            slice.map(async (p) => {
              const list = await listNotes(p.id);
              return list.map<DisplayNote>((n) => ({
                ...n,
                patientName: p.name,
                patientAge: p.age,
                patientGender: p.gender,
                patientBirthdate: p.birthdate,
              }));
            }),
          );
          perPatient.push(...chunk);
        }
        if (cancelled) return;
        allNotesLoadedKey.current = patientIdKey;
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
  }, [patientIdKey, patients, allNotes]);

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

  // Per-patient note stats: total count + number flagged for follow-up.
  // Derived from `allNotes` (loaded eagerly above) so the patient list
  // can render "N notes" + a "follow-up: K" badge next to each name.
  // For the currently-selected patient we overlay the live `notes` list
  // because it's refreshed after every add/edit/delete and reflects the
  // user's latest action even before allNotes refetches. Patients with
  // no entry in the map render as 0/0. When allNotes is still loading
  // (null) we return an empty map; PatientList treats `undefined` as
  // "unknown" and hides badges until data arrives, avoiding a
  // confusing "0 notes" flash on first paint.
  const noteStats = useMemo<Record<string, { total: number; followUps: number }>>(() => {
    if (!allNotes) return {};
    const stats: Record<string, { total: number; followUps: number }> = {};
    for (const p of patients) stats[p.id] = { total: 0, followUps: 0 };
    const hasFollowUp = (n: Note) =>
      typeof n.followUpNeeded === "string" && n.followUpNeeded.trim().length > 0;
    for (const n of allNotes) {
      const slot = stats[n.patientId] ?? { total: 0, followUps: 0 };
      slot.total += 1;
      if (hasFollowUp(n)) slot.followUps += 1;
      stats[n.patientId] = slot;
    }
    // Overlay live data for the currently-selected patient so the badge
    // reflects in-flight edits before the next allNotes refetch.
    if (selectedId) {
      stats[selectedId] = {
        total: notes.length,
        followUps: notes.filter(hasFollowUp).length,
      };
    }
    return stats;
  }, [allNotes, patients, notes, selectedId]);

  // Final patient list: client-side search + sort + optional
  // "follow-up only" narrowing. Consolidated into a single memo (vs.
  // a base memo + filter memo) so the sort is guaranteed to re-run on
  // every relevant change — that avoids any chance of the list
  // appearing "stuck" in an order from a previous filter state when
  // the user toggles the follow-up filter off.
  const filteredPatients = useMemo(() => {
    const sorted = filterAndSortPatients(patients, patientSearch, patientSort);
    if (!patientOnlyFollowUp) return sorted;
    return sorted.filter((p) => (noteStats[p.id]?.followUps ?? 0) > 0);
  }, [patients, patientSearch, patientSort, patientOnlyFollowUp, noteStats]);

  // The notes the History tab is currently rendering — either this patient's
  // notes, or everything aggregated. Null while "all" is still loading.
  const displayedNotes: DisplayNote[] | null = notesScope === "all" ? allNotes : notes;

  // Apply search + sort + follow-up filter on top of whichever list is shown.
  const filteredNotes = useMemo(
    () => filterAndSortNotes(displayedNotes ?? [], noteSearch, noteSort, notesOnlyFollowUp),
    [displayedNotes, noteSearch, noteSort, notesOnlyFollowUp],
  );

  // Set of note ids that are the most recent (by createdAt) for their
  // patient. The "Newly created" badge is exclusive to these — when the
  // user adds a newer note, the previous "newest" silently loses the
  // badge because it's no longer top-of-stack for that patient.
  //
  // We compute this against the FULL list (not the filtered one) so
  // sorting by oldest or filtering by follow-up doesn't change which
  // note holds the badge — it's always the chronologically newest.
  const newestNoteIdsPerPatient = useMemo(() => {
    const newest = new Map<string, DisplayNote>();
    for (const n of displayedNotes ?? []) {
      const current = newest.get(n.patientId);
      if (!current || n.createdAt > current.createdAt) {
        newest.set(n.patientId, n);
      }
    }
    return new Set(Array.from(newest.values(), (n) => n.id));
  }, [displayedNotes]);

  // Set of note ids that wear the "Recently edited" badge: the 3 most
  // recently edited notes PER PATIENT. Beyond that the badge would
  // proliferate across the history list and stop signaling anything
  // useful — capping at 3 keeps the cue meaningful while still
  // surfacing the small batch of notes the caregiver most likely
  // touched recently. Computed against the FULL list (not the
  // filtered one) so the cap doesn't shuffle based on search /
  // sort / follow-up filter state.
  const RECENTLY_EDITED_PER_PATIENT_CAP = 3;
  const recentlyEditedNoteIdsPerPatient = useMemo(() => {
    // Build a map of patientId → [{noteId, editedAt}, ...] for edited
    // notes only, then sort each bucket by edit time desc and keep
    // the top N.
    const buckets = new Map<string, { id: string; editedAt: string }[]>();
    for (const n of displayedNotes ?? []) {
      const editedAt = latestEditedAt(n);
      if (!editedAt) continue;
      const bucket = buckets.get(n.patientId);
      if (bucket) {
        bucket.push({ id: n.id, editedAt });
      } else {
        buckets.set(n.patientId, [{ id: n.id, editedAt }]);
      }
    }
    const ids = new Set<string>();
    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => b.editedAt.localeCompare(a.editedAt));
      for (let i = 0; i < Math.min(RECENTLY_EDITED_PER_PATIENT_CAP, bucket.length); i++) {
        ids.add(bucket[i]!.id);
      }
    }
    return ids;
  }, [displayedNotes]);

  const handleStructure = () => {
    const text = editableTranscript.trim();
    if (!text) {
      toast.error("Nothing to structure yet.");
      return;
    }
    const result = structureTranscript(text);
    setStructured(result);
    // If the heuristic extracted any follow-up text, enable the toggle so
    // the user sees the populated section without having to flip it.
    setFollowUpEnabledNew(result.followUpNeeded.trim().length > 0);
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
      // If the toggle is YES but the user didn't type anything, persist
      // FOLLOW_UP_DEFAULT so downstream UI (badges, "All notes" preview)
      // still has a non-empty signal. If the toggle is NO, persist "".
      const followUpRaw = followUpEnabledNew
        ? structured.followUpNeeded.trim().length > 0
          ? structured.followUpNeeded
          : FOLLOW_UP_DEFAULT
        : "";
      // Normalize free-text fields to sentence case before they're persisted
      // so the saved record reads cleanly regardless of how the user typed.
      const note = await createNote(selected.id, {
        transcript: capitalizeSentences(editableTranscript),
        patientConcern: capitalizeSentences(structured.patientConcern),
        careProvided: capitalizeSentences(structured.careProvided),
        patientStatus: capitalizeSentences(structured.patientStatus),
        followUpNeeded: capitalizeSentences(followUpRaw),
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
      setFollowUpEnabledNew(false);
      speech.reset();
      setTab("history");
      toast.success("Note saved", { description: "Encrypted and added to patient record." });
    } catch (err) {
      toast.error("Couldn't save note", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  // Triggered from the AlertDialog's confirm button — runs the actual
  // Cognito sign-out and bounces to the landing page. The dialog is
  // dismissed on its own via state, and the in-flight flag disables the
  // confirm button so a double-click can't fire two signOut calls.
  const handleConfirmSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate({ to: "/" });
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
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
            <div className="flex items-baseline gap-2 truncate font-display text-sm leading-tight sm:text-base">
              <span className="font-semibold">CareSync</span>
              {/* Tagline lives inline with the brand. Hidden below `sm` so
                  it doesn't crowd the header on phones; the caregiver
                  name in the profile pill on the right conveys context. */}
              <span className="hidden truncate text-xs font-medium italic text-muted-foreground sm:inline sm:text-sm">
                Voice notes that cares
              </span>
            </div>
          </div>

          {/* Mobile patient switcher. Trigger lives down by the tabs (see
              the two-button row below the patient header), so up here we
              only render the controlled <Sheet> itself. */}
          <Sheet open={patientSheetOpen} onOpenChange={setPatientSheetOpen}>
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
                  noteStats={noteStats}
                />
              </div>
              <div className="space-y-3 border-t bg-card p-3">
                <PatientFilters
                  search={patientSearch}
                  onSearchChange={setPatientSearch}
                  sort={patientSort}
                  onSortChange={setPatientSort}
                  onlyFollowUp={patientOnlyFollowUp}
                  onOnlyFollowUpChange={setPatientOnlyFollowUp}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    setPatientSheetOpen(false);
                    setShowAdd(true);
                  }}
                  // Use the brand primary rose so every red CTA across the
                  // app (sidebar + ADD, mobile action row, active tab pill)
                  // matches this one.
                  className="w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Add patient
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Sign out is the modern-app standard wording (Gmail / GitHub /
              AWS / Slack). Icon-only on phones, icon + label on sm+ so
              the action is unmistakable without sacrificing header width.
              The actual sign-out runs from the confirmation dialog below,
              not directly here — preventing accidental mid-charting taps
              that would discard the user's unsaved transcript. */}
          <Button
            variant="ghost"
            onClick={() => setConfirmSignOut(true)}
            className="h-9 gap-1.5 px-2 sm:px-3"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-sm sm:inline">Sign out</span>
          </Button>

          <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out of CareSync?</AlertDialogTitle>
                <AlertDialogDescription>
                  You'll need to sign back in with your email and password to
                  access patient records. Any unsaved transcript on the
                  Record tab will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={signingOut}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    // Prevent the Radix default close-on-click so we can
                    // keep the dialog mounted while the async sign-out is
                    // in flight — handleConfirmSignOut closes it itself.
                    e.preventDefault();
                    void handleConfirmSignOut();
                  }}
                  disabled={signingOut}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {signingOut ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Signing out…
                    </>
                  ) : (
                    "Sign out"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Profile entry point: caregiver name next to a standalone
              avatar circle. No always-on pill chrome — just clean
              elements with a subtle hover background, so it doesn't look
              like a heavy-weight pill. Name is hidden on phones so the
              avatar alone anchors the corner. */}
          <Link
            to="/profile"
            className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Edit profile"
            title="Edit profile"
          >
            <span className="hidden truncate text-sm font-medium text-foreground sm:inline">
              {displayName}
            </span>
            {/* Avatar renders an uploaded image / preset emoji / initials
                fallback depending on what the user has saved in their
                profile. The ring lights up on hover for visual feedback. */}
            <UserAvatar
              picture={profile?.picture}
              initials={initials}
              size="sm"
              className="ring-2 ring-transparent transition-all group-hover:ring-primary/30"
            />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[280px_1fr] lg:gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden space-y-3 lg:block">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Patients
            </h2>
            {/* Visual twin of the "PATIENTS" heading: same uppercase /
                tracking / weight / size, but boxed in the brand red so it
                reads as the primary CTA on the sidebar. Uses the same
                `bg-primary` rose as the active Record/Review/History tab
                pill, so the two red surfaces match across the page. */}
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="h-auto gap-1 rounded-md bg-primary px-2 py-0.5 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <PatientFilters
            search={patientSearch}
            onSearchChange={setPatientSearch}
            sort={patientSort}
            onSortChange={setPatientSort}
            onlyFollowUp={patientOnlyFollowUp}
            onOnlyFollowUpChange={setPatientOnlyFollowUp}
          />
          <PatientList
            patients={filteredPatients}
            totalCount={patients.length}
            selectedId={selectedId}
            onSelect={setSelectedId}
            noteStats={noteStats}
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

              {/* Patient navigation row — mobile only. Three equal-width
                  buttons: open the patient list sheet, add a new
                  patient, and jump straight to the Record tab to add
                  a note. Desktop already has these affordances via
                  the sidebar + tabs so the row is hidden at lg+.
                  All three share the brand red (`bg-primary`) — same
                  hue as the desktop sidebar's + ADD button and the
                  active Record/Review/History tab pill — so the row
                  reads as the primary navigation surface. */}
              <div className="flex gap-2 lg:hidden">
                <Button
                  onClick={() => setPatientSheetOpen(true)}
                  className="flex-1 gap-1.5 bg-primary px-2 text-primary-foreground hover:bg-primary/90"
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">Patients</span>
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-5 shrink-0 bg-primary-foreground/20 px-1.5 text-[10px] text-primary-foreground"
                  >
                    {patients.length}
                  </Badge>
                </Button>
                <Button
                  onClick={() => setShowAdd(true)}
                  className="flex-1 gap-1.5 bg-primary px-2 text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">Add patient</span>
                </Button>
                {/* "Add note" jumps to the Record tab so caregivers can
                    start a new note without scrolling down to the tab
                    bar. Disabled when there's no selected patient yet
                    — the Record tab needs one to attach the note to,
                    and tapping this with no patient would land them
                    on an empty-state page. */}
                <Button
                  onClick={() => setTab("record")}
                  disabled={!selected}
                  className="flex-1 gap-1.5 bg-primary px-2 text-primary-foreground hover:bg-primary/90"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">Add note</span>
                </Button>
              </div>

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
                        enabled={followUpEnabledNew}
                        onEnabledChange={setFollowUpEnabledNew}
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
                            isNewest={newestNoteIdsPerPatient.has(n.id)}
                            isRecentlyEdited={recentlyEditedNoteIdsPerPatient.has(n.id)}
                            onPatientClick={setEditingPatientId}
                            onOpen={(note) => {
                              // Always make sure the dialog has the patient
                              // demographics it needs (name + age + gender)
                              // for its header. In the cross-patient "All
                              // notes" view these are already attached by
                              // the aggregator. In single-patient view we
                              // look them up from `selected`.
                              const withDemographics: DisplayNote =
                                note.patientName !== undefined
                                  ? note
                                  : selected
                                    ? {
                                        ...note,
                                        patientName: selected.name,
                                        patientAge: selected.age,
                                        patientGender: selected.gender,
                                        patientBirthdate: selected.birthdate,
                                      }
                                    : note;
                              setOpenNote(withDemographics);
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
  noteStats,
}: {
  patients: Patient[];
  // Total count before filters were applied. Used to distinguish "no patients
  // at all" from "no patients match the current search".
  totalCount?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Map of patient id → { total notes, follow-ups }. A missing key
   * (vs. value 0) means stats haven't loaded yet — we hide the badges
   * in that case to avoid an incorrect "0 notes" flash before
   * allNotes resolves. */
  noteStats?: Record<string, { total: number; followUps: number }>;
}) {
  if (patients.length === 0 && (totalCount ?? 0) > 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
        No patients match your filters.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {patients.map((p) => {
        const active = p.id === selectedId;
        const stats = noteStats?.[p.id];
        // Pills only render when both:
        //  (a) stats have loaded (so we don't flash incorrect values),
        //  (b) the value is > 0 (a 0 count just creates visual noise
        //      for patients who have nothing yet — quiet patients stay
        //      quiet).
        // `undefined` stats = still loading, so we treat it like 0
        // here and render nothing until the eager allNotes fetch
        // resolves.
        const totalCount = stats?.total ?? 0;
        const followUpCount = stats?.followUps ?? 0;
        const countLabel =
          totalCount > 0 ? (totalCount === 1 ? "1 note" : `${totalCount} notes`) : null;
        const followLabel =
          followUpCount > 0
            ? `${followUpCount} follow-up${followUpCount === 1 ? "" : "s"} pending`
            : null;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left transition active:scale-[0.99] ${
              active
                ? "border-primary/40 bg-accent text-accent-foreground shadow-clinical"
                : "bg-card hover:border-primary/30 hover:bg-accent/50"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                Age {formatAgeLabel(p.birthdate, p.age)} · {formatPatientLocation(p)}
              </div>
            </div>
            {/* Pill cluster — pills side-by-side with a comfortable
                breathing gap. The selection dot renders ONLY for the
                currently-selected row, off the right edge, which
                visually nudges that row's pills left to make room
                for it. Unselected rows have no dot, so their pills
                stay flush right and align with each other. The
                slight left-shift on the selected row is the visual
                cue — "this is the one you're looking at". Counts
                use `min-w-[2ch]` + `tabular-nums` so a 1-digit pill
                takes exactly the same footprint as a 2-digit pill,
                keeping unselected rows perfectly aligned with each
                other. */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Hand and clipboard pills share the same shape
                  (`rounded-full`), padding (`py-1 pl-1 pr-3`), and
                  icon-to-digit gap (`gap-1`) so they read as a
                  matched pair, only differing in tint (purple vs.
                  brand red). The digit explicitly overrides to
                  `text-foreground` on both, so the number reads in the
                  standard body color (near-black in light mode,
                  near-white in dark mode) regardless of the pill's
                  background tint. */}
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full bg-purple-100 py-1 pl-1 pr-3 text-sm font-semibold text-purple-800 ring-1 ring-purple-300/60 dark:bg-purple-950/40 dark:text-purple-200 dark:ring-purple-700/40 ${
                  followLabel ? "" : "invisible"
                }`}
                aria-label={followLabel ? `${followLabel} for ${p.name}` : undefined}
                aria-hidden={followLabel ? undefined : true}
                title={followLabel ?? undefined}
              >
                <img
                  src={followUpHandUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-7 w-7 select-none"
                  draggable={false}
                />
                <span className="min-w-[2ch] text-right tabular-nums text-foreground">
                  {followUpCount}
                </span>
              </span>
              {/* Brand-red tint (matches the per-note "Recently edited"
                  badge + the active tab pill) so the clipboard pill
                  doesn't blend into the row's hover/accent background
                  the way the default secondary gray does. `rounded-full`
                  overrides the Badge component's default `rounded-md`
                  so its shape matches the hand pill exactly. */}
              <Badge
                variant="secondary"
                className={`flex shrink-0 items-center gap-1 rounded-full border-transparent bg-primary/10 py-1 pl-1 pr-3 text-sm font-semibold text-primary ring-1 ring-primary/30 dark:bg-primary/20 ${
                  countLabel ? "" : "invisible"
                }`}
                aria-label={countLabel ? `${countLabel} for ${p.name}` : undefined}
                aria-hidden={countLabel ? undefined : true}
              >
                <ClipboardList className="h-7 w-7" strokeWidth={1.75} />
                <span className="min-w-[2ch] text-right tabular-nums text-foreground">
                  {totalCount}
                </span>
              </Badge>
              {active && (
                <div
                  className="h-2 w-2 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
            </div>
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
  onlyFollowUp,
  onOnlyFollowUpChange,
  className,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  sort: PatientSort;
  onSortChange: (v: PatientSort) => void;
  /** If true, the list is narrowed to patients with at least one note
   * flagged for follow-up. Drives the new "Only show follow-up
   * patients" toggle below. */
  onlyFollowUp: boolean;
  onOnlyFollowUpChange: (v: boolean) => void;
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
      {/* Follow-up filter — same toggle pattern as NoteFilters'
          "Only show notes with follow-up", permanently purple-tinted
          so the row visually belongs to the purple follow-up family
          regardless of state. OFF = soft purple wash + purple text so
          the user knows what this control is for. ON = deeper purple
          background and a saturated-purple switch track so the active
          state is still clearly distinguishable from the resting
          state. The switch's gray-thumb (off) vs purple-thumb-track
          (on) is what tells you it's actually flipped. */}
      <label
        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
          onlyFollowUp
            ? "border-purple-300/60 bg-purple-100 dark:border-purple-700/40 dark:bg-purple-950/40"
            : "border-purple-200/60 bg-purple-50/60 dark:border-purple-800/30 dark:bg-purple-950/20"
        }`}
      >
        <span
          className={`flex items-center gap-2 ${
            onlyFollowUp
              ? "font-semibold text-purple-800 dark:text-purple-200"
              : "text-purple-700 dark:text-purple-300"
          }`}
        >
          <img
            src={followUpHandUrl}
            alt=""
            aria-hidden="true"
            className="h-5 w-5 select-none"
            draggable={false}
          />
          Only show follow-up patients
        </span>
        <Switch
          checked={onlyFollowUp}
          onCheckedChange={onOnlyFollowUpChange}
          className="data-[state=checked]:bg-purple-600 dark:data-[state=checked]:bg-purple-500"
        />
      </label>
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
      {/* Follow-up filter — mirrors the PatientFilters "Only show
          follow-up patients" toggle: permanently purple-tinted so the
          row visually belongs to the purple follow-up family
          regardless of state. OFF = soft purple wash + purple text so
          the user can spot the control as a follow-up affordance even
          when inactive. ON = deeper purple bg + saturated-purple
          switch track so the active state is still clearly
          distinguishable. The hand-with-heart icon also matches the
          per-row Follow-up badges and the patient-list follow-up pill
          for a unified visual language. */}
      <label
        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
          onlyFollowUp
            ? "border-purple-300/60 bg-purple-100 dark:border-purple-700/40 dark:bg-purple-950/40"
            : "border-purple-200/60 bg-purple-50/60 dark:border-purple-800/30 dark:bg-purple-950/20"
        }`}
      >
        <span
          className={`flex items-center gap-2 ${
            onlyFollowUp
              ? "font-semibold text-purple-800 dark:text-purple-200"
              : "text-purple-700 dark:text-purple-300"
          }`}
        >
          <img
            src={followUpHandUrl}
            alt=""
            aria-hidden="true"
            className="h-5 w-5 select-none"
            draggable={false}
          />
          Only show notes with follow-up
        </span>
        <Switch
          checked={onlyFollowUp}
          onCheckedChange={onOnlyFollowUpChange}
          className="data-[state=checked]:bg-purple-600 dark:data-[state=checked]:bg-purple-500"
        />
      </label>
    </div>
  );
}

function PatientHeader({ patient, noteCount }: { patient: Patient; noteCount: number }) {
  // Prefer the dynamically-computed age when we have a birthdate on file,
  // since the stored `age` was static at intake time and may now be stale.
  // formatAgeLabel also handles the under-1 case by switching to months.
  const ageLabel = formatAgeLabel(patient.birthdate, patient.age);
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
              {ageLabel}
            </Badge>
            {patient.gender && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">
                {patient.gender}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
            {formatPatientLocation(patient)} · {patient.conditionSummary ?? "General care"}
          </p>
        </div>
      </div>
      <Badge variant="secondary" className="gap-2 px-3 py-1.5 text-base sm:text-lg">
        <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" /> {noteCount}
      </Badge>
    </Card>
  );
}

// Display-formatted age: pluralized "yrs" for everyone 1+ year old, but
// switches to whole-month resolution for infants so a 5-month-old reads
// "5 months" instead of the uselessly-flat "0 yrs". Pass a birthdate when
// you have one (gives a months breakdown for infants); pass fallbackYears
// for legacy rows that only have the static `age` column.
function formatAgeLabel(birthdate: string | null, fallbackYears: number | null): string {
  if (birthdate && /^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
    const years = ageFromBirthdate(birthdate);
    if (years !== null && years >= 1) {
      return `${years} ${years === 1 ? "yr" : "yrs"}`;
    }
    const months = monthsFromBirthdate(birthdate);
    if (months !== null) {
      if (months <= 0) return "Newborn";
      return `${months} ${months === 1 ? "month" : "months"}`;
    }
  }
  if (fallbackYears !== null && fallbackYears !== undefined) {
    return `${fallbackYears} ${fallbackYears === 1 ? "yr" : "yrs"}`;
  }
  return "—";
}

// Whole-month age from a YYYY-MM-DD birthdate. Like ageFromBirthdate but
// counts months rather than years, so a baby born 5 months and 3 days ago
// returns 5 (not 6). Uses the local clock so the "has the day-of-month
// passed?" check matches the user's calendar.
function monthsFromBirthdate(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (now.getDate() < d) months -= 1;
  return Math.max(0, months);
}

// Short one-line summary of where this patient lives. Used in the header
// strip under their name. Prefers the new location_type-aware fields, but
// falls back to the legacy `room` text so pre-migration-006 rows still
// render something useful.
function formatPatientLocation(patient: Patient): string {
  if (patient.locationType === "clinic") {
    if (patient.clinicName) return patient.clinicName;
    return "Clinic";
  }
  if (patient.locationType === "home") {
    if (patient.homeAddress) {
      // The first line of the address is usually the most identifying
      // bit — truncate by line break, the full text is visible on edit.
      return patient.homeAddress.split(/\r?\n/)[0] ?? "Home";
    }
    return "Home";
  }
  if (patient.room) return `Rm ${patient.room}`;
  return "—";
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
    <FieldCard>
      <FieldLabel>{label}</FieldLabel>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Auto-capitalize on mobile keyboards — no-op on desktop, but the
        // on-save normalizer below handles desktop typing.
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        placeholder={placeholder}
        className="min-h-[64px] resize-none border-foreground/20 bg-background text-sm shadow-inner"
      />
    </FieldCard>
  );
}

/** Bordered card that wraps an entire editable field (label + input).
 * Gives edit-mode the same boxed-section feel that view-mode has via
 * DetailBlock pills, so the user reads each field as its own panel. */
function FieldCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-foreground/15 bg-card p-3 shadow-sm sm:p-4">
      {children}
    </div>
  );
}

/** Brand-tinted pill label used by edit-mode fields. Matches the section
 * pill in DetailBlock so view and edit modes share the same heading
 * language. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 inline-flex items-center rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 font-display text-sm font-bold uppercase tracking-wide text-primary shadow-sm sm:text-base">
      {children}
    </div>
  );
}

/** Specialized Field for "Follow-up needed". A yes/no Switch controls
 * whether the textarea is shown. Toggling to "No" clears the value so
 * the saved note actually reflects "no follow-up", not stale text. */
/** Default text persisted when the user toggles follow-up YES but never
 * types anything. The textarea intentionally stays empty in the UI so
 * the user is nudged to write something personalized — this default is
 * a fallback applied only at save time, by callers, when they detect
 * the empty-text-but-toggle-YES state. */
const FOLLOW_UP_DEFAULT = "Follow-up needed";

/**
 * Follow-up needed YES/NO toggle plus optional details textarea.
 *
 * Controlled in BOTH `enabled` and `value`. We keep `enabled` lifted to
 * the parent so the save handler knows the difference between:
 *   - toggle NO + empty text → "no follow-up needed"
 *   - toggle YES + empty text → "follow-up needed, no specific note"
 *
 * Without that, the two states would collapse into the same empty
 * string. The parent decides what to persist for the second case
 * (typically: send FOLLOW_UP_DEFAULT so downstream UI still has
 * something to display in the per-section preview).
 */
function FollowUpField({
  value,
  onChange,
  enabled,
  onEnabledChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  placeholder?: string;
}) {
  const handleToggle = (v: boolean) => {
    onEnabledChange(v);
    // Switching OFF clears any text the user had so re-toggling ON
    // starts fresh with an empty textarea (nudges personalization).
    if (!v) onChange("");
  };

  return (
    <FieldCard>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <FieldLabel>Follow-up needed</FieldLabel>
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
          placeholder={placeholder ?? "What needs to happen, by when, and by whom?"}
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          className="min-h-[64px] resize-none border-foreground/20 bg-background text-sm shadow-inner"
          autoFocus
        />
      )}
    </FieldCard>
  );
}

// Returns the ISO timestamp of the most recent edit to this note, or null
// if the note has never been edited since creation. "Edited" means any
// per-field *_edited_at column is set (migrations 003 + 004); we fall back
// to the row-level updated_at when it's meaningfully newer than created_at
// to catch rows that were modified before per-field stamps existed (the
// 2-second window absorbs the tiny clock skew mysql can introduce between
// inserting the row and the trailing ON UPDATE CURRENT_TIMESTAMP firing).
function latestEditedAt(note: Note): string | null {
  const perField = [
    note.transcriptEditedAt,
    note.patientConcernEditedAt,
    note.careProvidedEditedAt,
    note.patientStatusEditedAt,
    note.followUpNeededEditedAt,
    note.miscellaneousNotesEditedAt,
  ].filter((s): s is string => Boolean(s));
  if (perField.length > 0) {
    // ISO strings sort lexicographically the same as chronologically.
    return perField.sort()[perField.length - 1];
  }
  const updated = new Date(note.updatedAt).getTime();
  const created = new Date(note.createdAt).getTime();
  if (updated - created > 2000) return note.updatedAt;
  return null;
}

function NoteRow({
  note,
  isNewest,
  isRecentlyEdited,
  onPatientClick,
  onOpen,
}: {
  note: DisplayNote;
  // True only when this is the chronologically-newest note for its
  // patient. Drives the exclusive "Newly created" badge — once a newer
  // note exists for the same patient, the previous newest loses the
  // badge. Computed by the parent against the full list so sorting /
  // filtering doesn't shuffle which note holds it.
  isNewest: boolean;
  // True only when this note is among the N most-recently-edited notes
  // for its patient (capped by the parent). The "Recently edited" badge
  // is gated on this rather than on raw `wasEdited` so the cue stays
  // meaningful — every edited note used to wear the badge, which
  // turned it into background noise on patients with lots of edits.
  isRecentlyEdited: boolean;
  // Only invoked when the row is rendered with a patientName (i.e. inside
  // the cross-patient "All notes" view). Clicking opens the edit dialog
  // for that patient.
  onPatientClick?: (patientId: string) => void;
  // Opens the full-screen NoteDetailDialog for this note.
  onOpen?: (note: DisplayNote) => void;
}) {
  // The row's primary timestamp is the most recent activity for this
  // note — its creation time, or the latest per-field edit if the note
  // has been touched since. The badge to the right labels that
  // timestamp ("Recently saved" vs "Recently edited") so a quick glance
  // distinguishes brand-new notes from ones the user has revisited.
  const editStamp = latestEditedAt(note);
  const wasEdited = Boolean(editStamp);
  const date = new Date(editStamp ?? note.createdAt);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(note)}
      className="block w-full rounded-lg border border-foreground/15 bg-card p-3 text-left shadow-sm transition hover:-translate-y-px hover:border-primary/60 hover:bg-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
      aria-label="Open note details"
    >
      {/* Headline block — groups the patient name (when shown), the
          primary timestamp, and the status badges into a single
          visually-distinct header. The bottom border + padding
          create a clear horizontal divider between the "who/when"
          metadata and the actual note content below. Used in both
          the cross-patient "All notes" view and the single-patient
          history view; in the latter the patient name is skipped
          since the tab header already names the patient. */}
      <div className="mb-3 border-b border-foreground/15 pb-2">
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
            className="group -mx-1 mb-1.5 inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-base font-bold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg"
            aria-label={`Edit ${note.patientName}`}
            title="Click to edit patient"
          >
            <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="underline-offset-2 group-hover:underline">{note.patientName}</span>
          </span>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-foreground">
            {date.toLocaleDateString()} ·{" "}
            {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          {/* Badge rules:
                - Notes flagged for follow-up always show a purple badge so
                  the caregiver can spot them while scanning the history.
                  It's the most actionable signal, so it gets its own slot
                  and renders alongside the status badge below.
                - "Recently edited" (primary-tinted) is reserved for the
                  N most-recently-edited notes PER PATIENT — older edits
                  still have the per-field timestamp in the detail view,
                  but the row-level cue is intentionally limited so it
                  still means "you touched this recently".
                - The single most-recent note PER PATIENT gets "Newly
                  created" — adding a newer note silently transfers the
                  badge to it, so only one note per patient ever wears it.
                - Older un-edited notes show no status badge to keep the
                  row clean. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {note.followUpNeeded && note.followUpNeeded.trim().length > 0 && (
              <Badge
                variant="secondary"
                className="bg-purple-100 text-[10px] text-purple-800 ring-1 ring-purple-300/60 dark:bg-purple-950/40 dark:text-purple-200 dark:ring-purple-700/40"
              >
                Follow-up
              </Badge>
            )}
            {wasEdited && isRecentlyEdited ? (
              <Badge variant="secondary" className="bg-primary/10 text-[10px] text-primary">
                Recently edited
              </Badge>
            ) : !wasEdited && isNewest ? (
              <Badge variant="secondary" className="text-[10px]">
                Newly created
              </Badge>
            ) : null}
          </div>
        </div>
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

/**
 * Add / Edit patient form contract.
 *
 * Required fields (enforced both client- and server-side):
 *   - First name, last name
 *   - Birthdate (age is derived from this and never user-editable)
 *   - Condition
 *
 * Optional:
 *   - Gender (inclusive option list)
 *   - Location: a toggle between "home" (collects an address) and "clinic"
 *     (collects clinic name + clinic address). If the user picks neither,
 *     we just persist locationType=null.
 *
 * Add and Edit share the same field layout via PatientFormFields below, so
 * the only divergence is the initial state, the submit handler, and the
 * heading/button text.
 */

type PatientFormState = {
  firstName: string;
  lastName: string;
  birthdate: string;
  gender: string;
  locationType: "home" | "clinic" | "";
  homeAddress: string;
  clinicName: string;
  clinicAddress: string;
  condition: string;
};

const EMPTY_PATIENT_FORM: PatientFormState = {
  firstName: "",
  lastName: "",
  birthdate: "",
  gender: "",
  locationType: "",
  homeAddress: "",
  clinicName: "",
  clinicAddress: "",
  condition: "",
};

// Best-effort split of a single-string legacy name into first + last. Old
// rows store the whole name in `name`; new rows have first_name + last_name
// columns. For "John Smith" → { first: "John", last: "Smith" }; for
// "Madonna" or "" → { first, last: "" } so the user can fill in the rest.
function splitLegacyName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  if (!trimmed) return { first: "", last: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1).trim() };
}

function patientToFormState(patient: Patient): PatientFormState {
  const fallback = splitLegacyName(patient.name);
  return {
    firstName: patient.firstName ?? fallback.first,
    lastName: patient.lastName ?? fallback.last,
    birthdate: patient.birthdate ?? "",
    gender: patient.gender ?? "",
    locationType: patient.locationType ?? "",
    homeAddress: patient.homeAddress ?? "",
    clinicName: patient.clinicName ?? "",
    clinicAddress: patient.clinicAddress ?? "",
    condition: patient.conditionSummary ?? "",
  };
}

// Turn the form state into the API payload. Strips empty optional fields
// and only includes the sub-fields that match the chosen locationType so
// we don't accidentally persist clinic info on a patient at home.
function formStateToCreatePayload(s: PatientFormState) {
  const payload: {
    firstName: string;
    lastName: string;
    birthdate: string;
    conditionSummary: string;
    gender?: string;
    locationType?: "home" | "clinic";
    homeAddress?: string;
    clinicName?: string;
    clinicAddress?: string;
  } = {
    firstName: s.firstName.trim(),
    lastName: s.lastName.trim(),
    birthdate: s.birthdate,
    conditionSummary: s.condition.trim(),
  };
  if (s.gender) payload.gender = s.gender;
  if (s.locationType === "home") {
    payload.locationType = "home";
    if (s.homeAddress.trim()) payload.homeAddress = s.homeAddress.trim();
  } else if (s.locationType === "clinic") {
    payload.locationType = "clinic";
    if (s.clinicName.trim()) payload.clinicName = s.clinicName.trim();
    if (s.clinicAddress.trim()) payload.clinicAddress = s.clinicAddress.trim();
  }
  return payload;
}

// True only when every required field is present + valid. The submit
// button is wired to this so the user can't fire a doomed request.
function isPatientFormValid(s: PatientFormState): boolean {
  if (!s.firstName.trim()) return false;
  if (!s.lastName.trim()) return false;
  if (!s.birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(s.birthdate)) return false;
  if (!s.condition.trim()) return false;
  return true;
}

function AddPatientDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (p: Patient) => void;
}) {
  const [state, setState] = useState<PatientFormState>(EMPTY_PATIENT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const valid = isPatientFormValid(state);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      const p = await createPatient(formStateToCreatePayload(state));
      onAdded(p);
    } catch (err) {
      toast.error("Couldn't add patient", { description: describeApiError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PatientFormShell
      title="Add patient"
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      submitLabel={submitting ? "Adding…" : "Add patient"}
      canSubmit={valid}
    >
      <PatientFormFields state={state} onChange={setState} idPrefix="add" />
    </PatientFormShell>
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
  const [state, setState] = useState<PatientFormState>(() => patientToFormState(patient));
  const [submitting, setSubmitting] = useState(false);

  const valid = isPatientFormValid(state);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      // Always send first/last/condition/birthdate. Send gender + location
      // as empty strings (the backend interprets that as "clear the
      // column") so the user can also remove a previously stored value.
      const payload = formStateToCreatePayload(state);
      const updated = await updatePatient(patient.id, {
        ...payload,
        // Force-include optional fields so clearing them works as expected.
        gender: state.gender,
        locationType: state.locationType || undefined,
        homeAddress: state.locationType === "home" ? state.homeAddress : "",
        clinicName: state.locationType === "clinic" ? state.clinicName : "",
        clinicAddress: state.locationType === "clinic" ? state.clinicAddress : "",
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
    <PatientFormShell
      title="Edit patient"
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      submitLabel={submitting ? "Saving…" : "Save changes"}
      canSubmit={valid}
    >
      <PatientFormFields state={state} onChange={setState} idPrefix="edit" />
    </PatientFormShell>
  );
}

// Shared modal chrome: backdrop, scrollable card, header, footer actions.
// The form itself lives in the children. We let the card grow up to ~95vh
// and scroll inside so a long form (especially with the clinic branch) is
// still usable on small screens.
function PatientFormShell({
  title,
  onClose,
  onSubmit,
  submitting,
  submitLabel,
  canSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  submitLabel: string;
  canSubmit: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[95vh] w-full max-w-md flex-col rounded-b-none rounded-t-2xl p-0 shadow-clinical sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="border-b px-6 pb-3 pt-5 font-display text-xl font-semibold">{title}</h2>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">{children}</div>
          <div className="flex justify-end gap-2 border-t bg-card/95 px-6 py-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// The actual form. Shared between Add and Edit so the field set + layout
// can't drift between the two. The idPrefix prevents <label htmlFor>
// collisions when (hypothetically) both dialogs are rendered on the same
// page at once.
function PatientFormFields({
  state,
  onChange,
  idPrefix,
}: {
  state: PatientFormState;
  onChange: (next: PatientFormState) => void;
  idPrefix: string;
}) {
  // Display-formatted age label for the read-only pill. Switches to a
  // months-resolution string for infants under 1 year old.
  const computedAgeLabel = state.birthdate ? formatAgeLabel(state.birthdate, null) : null;

  // Each setter funnels through the parent's onChange so the form's
  // valid/invalid state stays in sync with the displayed values.
  const set = <K extends keyof PatientFormState>(key: K, value: PatientFormState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-fn`}>First name *</Label>
          <Input
            id={`${idPrefix}-fn`}
            required
            value={state.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            autoCapitalize="words"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-ln`}>Last name *</Label>
          <Input
            id={`${idPrefix}-ln`}
            required
            value={state.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            autoCapitalize="words"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-dob`}>Birthdate *</Label>
          <Input
            id={`${idPrefix}-dob`}
            type="date"
            required
            value={state.birthdate}
            max={new Date().toISOString().slice(0, 10)}
            min="1900-01-01"
            onChange={(e) => set("birthdate", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-age`}>Age</Label>
          {/* Read-only — derived from birthdate. We render it as a styled
              div rather than a disabled input so it doesn't look like
              something the user can interact with. */}
          <div
            id={`${idPrefix}-age`}
            aria-readonly
            className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
          >
            {computedAgeLabel ?? "—"}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-gender`}>Gender</Label>
        <GenderSelect value={state.gender} onChange={(v) => set("gender", v)} />
      </div>

      <div className="space-y-2">
        <Label>Where do they live?</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "home", label: "House / Apt" },
              { id: "clinic", label: "Clinic room" },
            ] as const
          ).map((opt) => {
            const active = state.locationType === opt.id;
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => set("locationType", active ? "" : opt.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-input bg-card text-foreground hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {state.locationType === "home" && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor={`${idPrefix}-home-addr`}>Address</Label>
            <Textarea
              id={`${idPrefix}-home-addr`}
              rows={2}
              value={state.homeAddress}
              onChange={(e) => set("homeAddress", e.target.value)}
              placeholder="123 Main St, Apt 4B, Springfield, IL 62704"
              autoCapitalize="words"
            />
          </div>
        )}

        {state.locationType === "clinic" && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-clinic-name`}>Clinic name</Label>
              <Input
                id={`${idPrefix}-clinic-name`}
                value={state.clinicName}
                onChange={(e) => set("clinicName", e.target.value)}
                placeholder="Springfield Memorial Care"
                autoCapitalize="words"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-clinic-addr`}>Clinic address</Label>
              <Textarea
                id={`${idPrefix}-clinic-addr`}
                rows={2}
                value={state.clinicAddress}
                onChange={(e) => set("clinicAddress", e.target.value)}
                placeholder="456 Hospital Way, Springfield, IL 62701"
                autoCapitalize="words"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-cond`}>Condition *</Label>
        <Textarea
          id={`${idPrefix}-cond`}
          required
          rows={2}
          value={state.condition}
          onChange={(e) => set("condition", e.target.value)}
          placeholder="e.g. Post-op recovery, type 2 diabetes, hypertension"
          autoCapitalize="sentences"
        />
      </div>
    </>
  );
}

// Inclusive gender picker — single source of truth for the option list,
// used by both AddPatientDialog and EditPatientDialog. The DB column is
// VARCHAR so callers can add new options here without a migration, and
// any free-form value typed by an older client still round-trips.
const GENDER_OPTIONS = [
  "Female",
  "Male",
  "Non-binary",
  "Transgender female",
  "Transgender male",
  "Other",
  "Prefer not to say",
] as const;

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
  // Toggle state for the follow-up YES/NO switch. Derived initially from
  // whether the note already has follow-up text; kept separate from
  // `followUp` so toggle-YES + empty text is preserved (save handler
  // substitutes FOLLOW_UP_DEFAULT in that case so we never persist
  // an inconsistent "on but blank" state).
  const [followUpEnabled, setFollowUpEnabled] = useState(
    (note.followUpNeeded ?? "").trim().length > 0,
  );
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

  // Use the shared helper so NoteRow and NoteDetailDialog can't disagree
  // about whether a given note counts as "edited".
  const editedIso = latestEditedAt(note);
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
      // Only send the fields the user actually changed in this edit
      // session. If we sent every field every time, `capitalizeSentences`
      // would subtly normalize unchanged-but-pre-normalizer text (e.g.
      // "patient reports pain." → "Patient reports pain.") and the
      // backend would correctly mark those columns as edited, stamping
      // every _edited_at timestamp. That's why a transcript-only edit
      // used to falsely flag patient_concern / care_provided as edited.
      //
      // The comparison is against the original raw values on `note` (the
      // dialog's prop, unchanged across the session). Capitalization is
      // applied only to fields that DID change, so the normalizer never
      // touches text the user didn't deliberately edit.
      const payload: Parameters<typeof updateNote>[2] = {};
      if (transcript !== note.transcript) {
        payload.transcript = capitalizeSentences(transcript);
      }
      if (concern !== (note.patientConcern ?? "")) {
        payload.patientConcern = capitalizeSentences(concern);
      }
      if (care !== (note.careProvided ?? "")) {
        payload.careProvided = capitalizeSentences(care);
      }
      if (status !== (note.patientStatus ?? "")) {
        payload.patientStatus = capitalizeSentences(status);
      }
      // Collapse the (enabled, text) toggle pair into the single string we
      // persist. Toggle YES + empty text → FOLLOW_UP_DEFAULT so the badge
      // and preview still render. Toggle NO → "" (clears any prior value).
      const effectiveFollowUp = followUpEnabled
        ? followUp.trim().length > 0
          ? followUp
          : FOLLOW_UP_DEFAULT
        : "";
      if (effectiveFollowUp !== (note.followUpNeeded ?? "")) {
        payload.followUpNeeded = capitalizeSentences(effectiveFollowUp);
      }
      if (misc !== (note.miscellaneousNotes ?? "")) {
        payload.miscellaneousNotes = capitalizeSentences(misc);
      }

      // No actual changes — bail out cleanly so we don't burn an API
      // round-trip or trigger any spurious _edited_at stamps.
      if (Object.keys(payload).length === 0) {
        setMode("view");
        toast.info("No changes to save");
        return;
      }

      const updated = await updateNote(note.patientId, note.id, payload);
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
    setFollowUpEnabled((note.followUpNeeded ?? "").trim().length > 0);
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
        {/* Header — title on the left, edit + close icons on the right.
            The "Last edited" line lives directly under "Created" so both
            timestamps for the whole note read together. */}
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            {note.patientName && (
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2 font-display text-2xl font-bold text-primary sm:text-3xl">
                  <HeartPulse className="h-6 w-6 sm:h-7 sm:w-7" />
                  {note.patientName}
                </div>
                {/* Demographics live to the right of the name on wide
                    screens and wrap below it on narrow ones. Order matches
                    EHR-banner convention (Epic / Cerner): DOB → Age →
                    Gender. DOB sits right after the name because it's the
                    secondary identifier that disambiguates same-name
                    patients; age is its contextual derivative; gender
                    closes the demographic strip. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {note.patientBirthdate && (
                    <Badge variant="secondary" className="font-mono text-xs sm:text-sm">
                      {formatBirthdate(note.patientBirthdate)}
                    </Badge>
                  )}
                  {(note.patientBirthdate || typeof note.patientAge === "number") && (
                    <Badge variant="secondary" className="text-xs sm:text-sm">
                      {formatAgeLabel(
                        note.patientBirthdate ?? null,
                        typeof note.patientAge === "number" ? note.patientAge : null,
                      )}
                    </Badge>
                  )}
                  {note.patientGender && (
                    <Badge variant="secondary" className="text-xs sm:text-sm">
                      {note.patientGender}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground sm:text-sm">
              <span className="font-medium">Created</span> {formattedCreated}
            </p>
            {wasEdited && (
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs italic text-amber-700 sm:text-sm">
                <Pencil className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                <span>
                  <span className="not-italic">Last edited</span> {formattedUpdated}
                </span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {mode === "view" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMode("edit")}
                aria-label="Edit note"
                title="Edit note"
                className="h-11 w-11 sm:h-12 sm:w-12"
              >
                <Pencil className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="h-11 w-11 sm:h-12 sm:w-12"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
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
              <FieldCard>
                <FieldLabel>Transcript</FieldLabel>
                <Textarea
                  id="edit-note-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck
                  rows={6}
                  className="border-foreground/20 bg-background text-sm shadow-inner"
                />
              </FieldCard>
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
                enabled={followUpEnabled}
                onEnabledChange={setFollowUpEnabled}
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
    <FieldCard>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* Each section title sits in its own pill — a brand-tinted box so
            the eye can scan section headers at a glance instead of parsing
            run-on field labels. */}
        <FieldLabel>{label}</FieldLabel>
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
    </FieldCard>
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

// Numeric age in MONTHS for sort comparisons. Birthdate is the source
// of truth when present (matches what formatAgeLabel renders), so a
// patient added a year ago sorts as 1 year older today, and infants
// who were stored as `age: 0` still sort correctly among each other
// (5 months < 9 months < 14 months < ...). Legacy rows that have no
// birthdate fall back to `age * 12` so they slot into the same
// month-based scale.
function patientAgeMonths(p: Patient): number {
  if (p.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(p.birthdate)) {
    const months = monthsFromBirthdate(p.birthdate);
    if (months !== null) return months;
  }
  return (p.age ?? 0) * 12;
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
      filtered.sort((a, b) => patientAgeMonths(a) - patientAgeMonths(b));
      break;
    case "age-old":
      filtered.sort((a, b) => patientAgeMonths(b) - patientAgeMonths(a));
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
