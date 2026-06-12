import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Loader2, Stethoscope, AlertTriangle } from "lucide-react";
import {
  type AuthUser,
  type Occupation,
  type UserProfile,
  OCCUPATIONS,
  OCCUPATION_LABELS,
  MIN_ALLOWED_BIRTHDATE,
  getCurrentUser,
  getCachedUserProfile,
  getUserProfile,
  isValidBirthdate,
  maxAllowedBirthdate,
  saveUserProfile,
} from "@/lib/caresync-store";
import { AvatarPicker } from "@/components/avatar-picker";

export const Route = createFileRoute("/profile")({
  component: ProfileEdit,
  head: () => ({
    meta: [
      { title: "Your profile — CareSync" },
      { name: "description", content: "Update your name, date of birth, and role." },
    ],
  }),
});

function ProfileEdit() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [original, setOriginal] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [occupation, setOccupation] = useState<Occupation | "">("");
  const [picture, setPicture] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const maxDob = maxAllowedBirthdate();

  // Load existing profile (cache-first for instant paint, then Cognito).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        navigate({ to: "/" });
        return;
      }
      setAuth(u);

      const cached = getCachedUserProfile(u.email);
      if (cached) hydrate(cached);

      const fresh = await getUserProfile(u.email);
      if (cancelled) return;
      if (!fresh) {
        // User landed here without ever completing onboarding — send them
        // through the proper flow instead of letting them save an empty form.
        navigate({ to: "/onboarding" });
        return;
      }
      hydrate(fresh);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    function hydrate(p: UserProfile) {
      setOriginal(p);
      setFirstName(p.firstName);
      setLastName(p.lastName);
      setBirthdate(p.birthdate);
      setOccupation(p.occupation);
      setPicture(p.picture);
    }
  }, [navigate]);

  const dirty =
    !!original &&
    (firstName.trim() !== original.firstName ||
      lastName.trim() !== original.lastName ||
      birthdate !== original.birthdate ||
      occupation !== original.occupation ||
      picture !== original.picture);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter both your first and last name.");
      return;
    }
    if (!isValidBirthdate(birthdate)) {
      setError("Please enter a valid date of birth (you must be at least 13).");
      return;
    }
    if (!occupation) {
      setError("Please select your role.");
      return;
    }
    if (!auth) return;

    setBusy(true);
    try {
      const next = await saveUserProfile(auth.email, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthdate,
        occupation,
        picture,
      });
      setOriginal(next);
      setSaved(true);
      // Soft-flash the success state, then leave it — staying on the page
      // lets the user keep editing without bouncing around.
      setTimeout(() => setSaved(false), 2200);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Couldn't save your profile. Check your connection and try again.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-hero flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" aria-label="Loading profile" />
      </div>
    );
  }

  return (
    <div className="bg-hero min-h-screen px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard" })}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground shadow-clinical flex h-9 w-9 items-center justify-center rounded-xl">
              <Stethoscope className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-semibold">CareSync</span>
          </div>
        </div>

        <Card className="shadow-clinical p-6">
          <div className="mb-5">
            <h1 className="font-display text-2xl font-semibold">Your profile</h1>
            <p className="text-muted-foreground text-sm">
              Update the details we use to personalize your dashboard.
            </p>
          </div>

          {error && (
            <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 flex items-start gap-2 rounded-md border p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {saved && !error && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Profile saved.</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={submit} noValidate>
            {/* Avatar picker stays at the top of the form so changes to
                it propagate to the dashboard header immediately on save. */}
            <div className="space-y-1.5">
              <Label>Avatar</Label>
              <AvatarPicker
                value={picture}
                onChange={setPicture}
                initials={
                  (firstName.trim()[0] ?? "").toUpperCase() +
                  (lastName.trim()[0] ?? "").toUpperCase()
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="birthdate">Date of birth</Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                min={MIN_ALLOWED_BIRTHDATE}
                max={maxDob}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="occupation">Role</Label>
              <select
                id="occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value as Occupation)}
                required
                className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  Select your role…
                </option>
                {OCCUPATIONS.map((o) => (
                  <option key={o} value={o}>
                    {OCCUPATION_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/dashboard" })}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !dirty} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {dirty ? "Save changes" : "Saved"}
              </Button>
            </div>
          </form>
        </Card>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          Signed in as <span className="text-foreground font-medium">{auth?.email}</span>
        </p>
      </div>
    </div>
  );
}
