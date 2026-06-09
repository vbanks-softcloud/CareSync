import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, Stethoscope, AlertTriangle } from "lucide-react";
import {
  type AuthUser,
  type Occupation,
  OCCUPATIONS,
  OCCUPATION_LABELS,
  getCurrentUser,
  isProfileComplete,
  saveUserProfile,
} from "@/lib/caresync-store";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
  head: () => ({
    meta: [
      { title: "Set up your account — CareSync" },
      {
        name: "description",
        content: "Tell us a bit about yourself so we can personalize CareSync.",
      },
    ],
  }),
});

function Onboarding() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [occupation, setOccupation] = useState<Occupation | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth + already-onboarded gate. Bounces back to landing if not signed in,
  // and skips this whole screen if the user has already completed it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        navigate({ to: "/" });
        return;
      }
      if (isProfileComplete(u.email)) {
        navigate({ to: "/dashboard" });
        return;
      }
      setAuth(u);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter both your first and last name.");
      return;
    }
    // Age must be a 1- or 2-digit positive integer (i.e. 1–99).
    const ageNum = Number.parseInt(age, 10);
    if (!/^\d{1,2}$/.test(age.trim()) || !Number.isFinite(ageNum) || ageNum < 1) {
      setError("Please enter a valid age.");
      return;
    }
    if (!occupation) {
      setError("Please select your role.");
      return;
    }
    if (!auth) return;

    setBusy(true);
    try {
      saveUserProfile(auth.email, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        age: ageNum,
        occupation,
      });
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="bg-hero flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="bg-hero min-h-screen px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="bg-primary text-primary-foreground shadow-clinical flex h-9 w-9 items-center justify-center rounded-xl">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold">CareSync</span>
        </div>

        <Card className="shadow-clinical p-6">
          <div className="mb-5">
            <h1 className="font-display text-2xl font-semibold">Welcome to CareSync</h1>
            <p className="text-muted-foreground text-sm">
              Tell us a bit about yourself. This personalizes your dashboard and helps us tailor
              prompts to your role.
            </p>
          </div>

          {error && (
            <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 flex items-start gap-2 rounded-md border p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={submit} noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                  placeholder="Jane"
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
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="text"
                inputMode="numeric"
                pattern="\d{1,2}"
                maxLength={2}
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
                required
                placeholder="32"
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

            <Button type="submit" className="w-full gap-2" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden />
              )}
              Continue to dashboard
            </Button>
          </form>
        </Card>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          Signed in as <span className="text-foreground font-medium">{auth?.email}</span>
        </p>
      </div>
    </div>
  );
}
