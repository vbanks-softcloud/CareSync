import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  FileText,
  Lock,
  Loader2,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Mail,
} from "lucide-react";
import { mockSignIn, getCurrentUser, isCognitoConfigured } from "@/lib/caresync-store";
import * as cognito from "@/lib/cognito";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (!cancelled && u) navigate({ to: "/dashboard" });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-clinical">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold">CareSync</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#security" className="hover:text-foreground">
            Security
          </a>
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 md:grid-cols-2 md:items-center md:pt-16">
        <div>
          <Badge variant="secondary" className="mb-5 rounded-full px-3 py-1 text-xs font-medium">
            <Sparkles className="mr-1.5 h-3 w-3" /> AI-assisted documentation
          </Badge>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] text-foreground md:text-6xl">
            Voice notes that
            <span className="block text-primary">care for caregivers.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            CareSync lets CNAs, caregivers, and family providers record patient care notes by voice
            — automatically transcribed, structured, and stored securely.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#features">
              <Button size="lg" variant="outline">
                See features
              </Button>
            </a>
          </div>
          <div className="mt-8 flex items-center gap-5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> MFA protected
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> KMS encrypted
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Audit logged
            </span>
          </div>
        </div>

        <SignInForm onDone={() => navigate({ to: "/dashboard" })} />
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">
            A documentation workflow that disappears.
          </h2>
          <p className="mt-3 text-muted-foreground">
            From mic to medical record in under a minute.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Mic,
              title: "Live voice capture",
              body: "Press record and dictate naturally. Live transcription appears as you speak.",
            },
            {
              icon: Sparkles,
              title: "Auto-structured notes",
              body: "Concern, care provided, status, follow-up — categorized automatically.",
            },
            {
              icon: ShieldCheck,
              title: "Secure by design",
              body: "Built around Cognito MFA, KMS encryption, and CloudTrail audit logs.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 font-display text-lg font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 rounded-3xl bg-card p-10 shadow-clinical md:grid-cols-4">
          {[
            ["01", "Record", "Caregiver dictates a care note from the dashboard."],
            ["02", "Transcribe", "Speech is converted to text in real time."],
            ["03", "Structure", "AI organizes the note into clinical sections."],
            ["04", "Save", "Reviewed note is encrypted and stored to the record."],
          ].map(([n, t, b]) => (
            <div key={n}>
              <div className="font-display text-2xl text-primary">{n}</div>
              <div className="mt-2 font-semibold">{t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{b}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="security" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="font-display text-3xl font-semibold md:text-4xl">
              Healthcare-grade security.
            </h2>
            <p className="mt-3 text-muted-foreground">
              CareSync is designed around the practices healthcare workflows demand — identity,
              encryption, isolation, and accountability.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              "Amazon Cognito authentication with MFA",
              "AWS KMS encryption for data at rest",
              "API Gateway-secured service communication",
              "CloudTrail audit logging of every action",
              "Per-user record isolation by design",
            ].map((s) => (
              <li key={s} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
                <span className="text-sm">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} CareSync — Demo prototype</span>
          <span>Built by Jose, Ernest, Vince, Shauna, AT & Dawit</span>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------- Sign-in form ----------------------- */
//
// State machine:
//   creds(signin)        → on submit → cognito.signIn
//                             ↳ MFA_TOTP   → 'mfa-totp'
//                             ↳ MFA_SETUP  → 'mfa-setup' (first ever sign-in)
//                             ↳ DONE       → navigate to /dashboard
//   creds(signup)        → on submit → cognito.signUp → 'confirm-signup'
//   confirm-signup       → on submit → cognito.confirmSignUp → 'creds(signin)'
//   mfa-totp / mfa-setup → on submit → cognito.confirmSignIn → navigate
//
// When Cognito isn't configured, falls back to the mock flow (any password,
// any 4+ digit "MFA" code, no real Cognito calls).

type Stage =
  | { kind: "creds"; mode: "signin" | "signup" }
  | { kind: "confirm-signup" }
  | { kind: "mfa-totp" }
  | { kind: "mfa-setup"; secret: string; uri: string }
  | { kind: "mock-mfa" }
  | { kind: "forgot-password-request" }
  | { kind: "forgot-password-confirm" };

function SignInForm({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: "creds", mode: "signin" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Drives the full-card overlay shown while the email-verification code is
  // being checked, then briefly again as a success indicator before the form
  // transitions back to the sign-in step.
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "success">("idle");

  const reset = () => {
    setCode("");
    setNewPassword("");
    setError(null);
    setInfo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (stage.kind === "creds") {
        if (!isCognitoConfigured) {
          if (email && password) {
            setStage({ kind: "mock-mfa" });
            reset();
          }
          return;
        }
        if (stage.mode === "signin") {
          const step = await cognito.signIn(email, password);
          handleStep(step);
        } else {
          await cognito.signUp(email, password);
          setStage({ kind: "confirm-signup" });
          setInfo(
            `We emailed a 6-digit code to ${email}. Check your inbox (and spam folder), then enter it below.`,
          );
          setCode("");
        }
      } else if (stage.kind === "confirm-signup") {
        setVerifyStatus("verifying");
        await cognito.confirmSignUp(email, code);
        setVerifyStatus("success");
        // Hold the green checkmark long enough that the user registers it
        // before we swap back to the sign-in form. Tuned by feel — short
        // enough to not feel slow, long enough to read the success copy.
        await new Promise((resolve) => setTimeout(resolve, 2200));
        setStage({ kind: "creds", mode: "signin" });
        setInfo("Email verified. Sign in below.");
        setCode("");
        setVerifyStatus("idle");
      } else if (stage.kind === "mfa-totp" || stage.kind === "mfa-setup") {
        const step = await cognito.confirmSignIn(code);
        handleStep(step);
      } else if (stage.kind === "forgot-password-request") {
        await cognito.resetPassword(email);
        setStage({ kind: "forgot-password-confirm" });
        // Vague-on-purpose message: Cognito's "Prevent user existence errors"
        // setting returns success for unknown emails to block user enumeration.
        // Either the user gets a real code, or they don't — we can't tell the
        // difference here and shouldn't pretend we can.
        setInfo(
          `If an account exists for ${email}, we sent a 6-digit reset code. Check your inbox (and spam folder).`,
        );
        setCode("");
        setNewPassword("");
      } else if (stage.kind === "forgot-password-confirm") {
        await cognito.confirmResetPassword(email, code, newPassword);
        setStage({ kind: "creds", mode: "signin" });
        setInfo("Password reset. Sign in with your new password.");
        setPassword("");
        setCode("");
        setNewPassword("");
      } else if (stage.kind === "mock-mfa") {
        if (code.length >= 4) {
          mockSignIn(email);
          onDone();
        }
      }
    } catch (e: unknown) {
      setError(toMessage(e));
      setVerifyStatus("idle");
    } finally {
      setBusy(false);
    }
  };

  const handleStep = (step: cognito.SignInStep) => {
    switch (step.kind) {
      case "DONE":
        onDone();
        return;
      case "MFA_TOTP":
        setStage({ kind: "mfa-totp" });
        setInfo("Enter the 6-digit code from your authenticator app.");
        setCode("");
        return;
      case "MFA_SETUP":
        setStage({ kind: "mfa-setup", secret: step.secretCode, uri: step.otpAuthUri });
        setInfo(
          "First sign-in: add CareSync to your authenticator app, then enter the 6-digit code.",
        );
        setCode("");
        return;
      case "CONFIRM_SIGN_UP":
        setStage({ kind: "confirm-signup" });
        setInfo(`Confirm the 6-digit code we emailed to ${email}. Check spam if you don't see it.`);
        setCode("");
        return;
      case "NEW_PASSWORD":
        setError("Account requires a new password. Use the AWS console to reset it for now.");
        return;
    }
  };

  const title = (() => {
    switch (stage.kind) {
      case "creds":
        return stage.mode === "signin" ? "Sign in" : "Create account";
      case "confirm-signup":
        return "Verify your email";
      case "mfa-totp":
        return "Enter MFA code";
      case "mfa-setup":
        return "Set up MFA";
      case "mock-mfa":
        return "Enter MFA code";
      case "forgot-password-request":
        return "Reset password";
      case "forgot-password-confirm":
        return "Reset password";
    }
  })();

  const subtitle = (() => {
    if (info) return info;
    if (stage.kind === "creds" && !isCognitoConfigured) {
      return "Demo login — no real account needed.";
    }
    if (stage.kind === "mock-mfa") return "Enter any 6 digits — this is a mock.";
    return "";
  })();

  return (
    <Card className="relative mx-auto w-full max-w-md p-6 shadow-clinical">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {isCognitoConfigured && stage.kind === "creds" && (
        <div className="mb-4 flex rounded-lg border border-primary/20 bg-primary/5 p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setStage({ kind: "creds", mode: m });
                reset();
              }}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
                stage.mode === m
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "text-primary hover:text-primary/80"
              }`}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="space-y-4" onSubmit={submit}>
        {stage.kind === "creds" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="caregiver@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {stage.mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setStage({ kind: "forgot-password-request" });
                      reset();
                      setPassword("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <PasswordInput
                id="password"
                autoComplete={stage.mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {stage.mode === "signup" && <PasswordRequirements password={password} />}
            </div>
            <SubmitButton
              busy={busy}
              disabled={stage.mode === "signup" && !passwordMeetsPolicy(password)}
            >
              {stage.mode === "signin" ? "Continue" : "Create account"}
            </SubmitButton>
          </>
        )}

        {stage.kind === "confirm-signup" && (
          <>
            <CodeField value={code} onChange={setCode} />
            <SubmitButton busy={busy}>Verify email</SubmitButton>
            <SpamFolderHint />
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <span>Didn't get a code?</span>
              <button
                type="button"
                disabled={busy || !email}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await cognito.resendSignUpCode(email);
                    setInfo(
                      "A new code is on its way. Check your spam folder if it doesn't arrive.",
                    );
                  } catch (e: unknown) {
                    setError(toMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-md px-2 py-1 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                Re-send code
              </button>
            </div>
          </>
        )}

        {stage.kind === "forgot-password-request" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="caregiver@example.com"
              />
            </div>
            <SubmitButton busy={busy} disabled={!email}>
              Send reset code
            </SubmitButton>
            <button
              type="button"
              onClick={() => {
                setStage({ kind: "creds", mode: "signin" });
                reset();
              }}
              className="w-full rounded-md py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Back to sign in
            </button>
          </>
        )}

        {stage.kind === "forgot-password-confirm" && (
          <>
            <CodeField value={code} onChange={setCode} />
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordRequirements password={newPassword} />
            </div>
            <SubmitButton
              busy={busy}
              disabled={code.length < 6 || !passwordMeetsPolicy(newPassword)}
            >
              Reset password
            </SubmitButton>
            <SpamFolderHint />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setStage({ kind: "creds", mode: "signin" });
                  reset();
                }}
                className="rounded-md px-2 py-1 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                Back to sign in
              </button>
              <div className="flex items-center gap-1">
                <span>Didn't get a code?</span>
                <button
                  type="button"
                  disabled={busy || !email}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await cognito.resetPassword(email);
                      setInfo("If an account exists for that email, a new code is on its way.");
                    } catch (e: unknown) {
                      setError(toMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded-md px-2 py-1 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                >
                  Re-send code
                </button>
              </div>
            </div>
          </>
        )}

        {stage.kind === "mfa-setup" && (
          <>
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="mb-2 font-medium text-foreground">Add to your authenticator app</div>
              <div className="mb-1 text-muted-foreground">Account: CareSync ({email})</div>
              <div className="mb-2 text-muted-foreground">
                Secret key (manual entry):
                <code className="ml-1 rounded bg-card px-1.5 py-0.5 font-mono text-foreground">
                  {stage.secret}
                </code>
              </div>
              <a
                href={stage.uri}
                className="text-primary underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Open in authenticator app
              </a>
            </div>
            <CodeField value={code} onChange={setCode} />
            <SubmitButton busy={busy}>Verify & enter</SubmitButton>
          </>
        )}

        {(stage.kind === "mfa-totp" || stage.kind === "mock-mfa") && (
          <>
            <CodeField value={code} onChange={setCode} />
            <SubmitButton busy={busy}>Verify & enter</SubmitButton>
            <button
              type="button"
              onClick={() => {
                setStage({ kind: "creds", mode: "signin" });
                reset();
              }}
              className="w-full rounded-md py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Back
            </button>
          </>
        )}
      </form>

      {!isCognitoConfigured && (
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Cognito not configured — using local mock auth.
        </p>
      )}

      {stage.kind === "confirm-signup" && verifyStatus !== "idle" && (
        <div
          className="animate-in fade-in absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-card/95 p-6 text-center backdrop-blur-sm duration-200"
          role="status"
          aria-live="polite"
        >
          {verifyStatus === "verifying" ? (
            <>
              <Loader2
                className="text-primary h-14 w-14 animate-spin"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-foreground mt-5 text-base font-semibold">
                Verifying your email…
              </p>
              <p className="text-muted-foreground mt-1 text-xs">This will only take a moment.</p>
            </>
          ) : (
            <>
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30" />
                <span className="absolute inset-2 rounded-full bg-emerald-500/10" />
                <CheckCircle2
                  className="animate-in zoom-in-50 relative h-16 w-16 text-emerald-500 duration-500"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
              <p className="text-foreground mt-5 text-base font-semibold">Email verified!</p>
              <p className="text-muted-foreground mt-1 text-xs">Taking you to sign in…</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="submit" className="w-full gap-2" disabled={busy || disabled}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: "At least 10 characters", test: (pw) => pw.length >= 10 },
  { label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "A number", test: (pw) => /\d/.test(pw) },
  // Cognito's allowed symbol set: ^$*.[]{}()?"!@#%&/\,><':;|_~`+=-
  // Simpler check: any non-alphanumeric character qualifies.
  { label: "A symbol (e.g. ! @ # $ %)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function passwordMeetsPolicy(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {PASSWORD_RULES.map(({ label, test }) => {
        const ok = test(password);
        return (
          <li
            key={label}
            className={`flex items-center gap-2 transition-colors ${
              ok ? "text-emerald-600" : "text-muted-foreground"
            }`}
          >
            {ok ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="h-3 w-3 shrink-0" aria-hidden />
            )}
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SpamFolderHint() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Can't find the email? Check your <strong className="font-semibold">spam</strong> or junk
        folder.
      </span>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={onChange}
        placeholder="••••••••"
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-r-md"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="code">6-digit code</Label>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder="123456"
      />
    </div>
  );
}

function toMessage(e: unknown): string {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : "Something went wrong. Please try again.";
  // Cognito returns errors using "username", but the UI uses email — translate
  // so error messages match the field labels the user sees.
  return raw.replace(/\busername\b/g, "email").replace(/\bUsername\b/g, "Email");
}
