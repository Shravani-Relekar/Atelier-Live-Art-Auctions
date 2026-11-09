import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api";

function useRedirectTarget() {
  const location = useLocation();
  return (location.state as { from?: string } | null)?.from ?? "/";
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md border border-ink/10 bg-paper-card p-8 sm:p-10">
        <h1 className="text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  const fe = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors ?? {};
  return Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]]));
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const to = useRedirectTarget();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      toast({ tone: "success", title: `Welcome back, ${u.name.split(" ")[0]}`, body: `Your paddle number is #${u.paddle}.` });
      navigate(to, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Log in" subtitle="Access your bids, watchlist and paddle.">
      <form onSubmit={submit} className="space-y-5">
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p className="text-sm text-live" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log in"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">New to Atelier? <Link to="/register" state={{ from: to }} className="link-underline text-ink">Create an account</Link></p>
    </AuthShell>
  );
}

const COUNTRIES = ["India", "United Arab Emirates", "United Kingdom", "Germany", "United States", "France", "Singapore", "Japan", "Other"];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const to = useRedirectTarget();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", country: "India" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const u = await register({ ...form, phone: form.phone || undefined });
      toast({ tone: "success", title: "Account created", body: `You're registered to bid. Paddle #${u.paddle}.` });
      navigate(to, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err instanceof ApiError ? err.message : "Could not register");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Register to bid" subtitle="Create an account to bid in live auctions.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id="name" label="Full name" error={errors.name}><input id="name" autoComplete="name" required className="input" value={form.name} onChange={set("name")} /></Field>
        <Field id="email" label="Email" error={errors.email}><input id="email" type="email" autoComplete="email" required className="input" value={form.email} onChange={set("email")} /></Field>
        <Field id="password" label="Password" error={errors.password} hint="At least 8 characters with a letter and a number.">
          <input id="password" type="password" autoComplete="new-password" required minLength={8} className="input" value={form.password} onChange={set("password")} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="phone" label="Phone (optional)" error={errors.phone}><input id="phone" type="tel" autoComplete="tel" className="input" value={form.phone} onChange={set("phone")} /></Field>
          <Field id="country" label="Country" error={errors.country}>
            <select id="country" className="input" value={form.country} onChange={set("country")}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        </div>
        {error && !Object.keys(errors).length && <p className="text-sm text-live" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}</button>
        <p className="text-xs text-ink-muted">By registering you agree that bids placed are binding offers to purchase.</p>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">Already registered? <Link to="/login" state={{ from: to }} className="link-underline text-ink">Log in</Link></p>
    </AuthShell>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-live">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
