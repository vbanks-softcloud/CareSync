import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mic, ShieldCheck, Sparkles, Stethoscope, FileText, Lock } from "lucide-react";
import { signIn, getAuth } from "@/lib/caresync-store";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"creds" | "mfa">("creds");

  useEffect(() => {
    if (getAuth()) navigate({ to: "/dashboard" });
  }, [navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "creds") {
      if (email && password) setStep("mfa");
      return;
    }
    if (code.length >= 4) {
      signIn(email);
      navigate({ to: "/dashboard" });
    }
  };

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
            <Link to="/dashboard">
              <Button size="lg" className="gap-2">
                <Mic className="h-4 w-4" /> Try the live demo
              </Button>
            </Link>
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

        <Card className="relative mx-auto w-full max-w-md p-6 shadow-clinical">
          <div className="mb-4">
            <h2 className="font-display text-2xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              {step === "creds"
                ? "Demo login — no real account needed."
                : "Enter the 6-digit MFA code (any digits work)."}
            </p>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            {step === "creds" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="caregiver@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Continue
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mfa">MFA code</Label>
                  <Input
                    id="mfa"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Verify & enter
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("creds")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              </>
            )}
          </form>
        </Card>
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
