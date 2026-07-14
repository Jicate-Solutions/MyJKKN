'use client';

/**
 * SF100 external mentor/investor login. Account-less: email/phone + a 6-digit
 * access code (shared out-of-band by a JKKN coordinator). No password, no
 * Supabase session — a wrong-code lockout is the safety net (spec §4).
 */
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';

export default function ExternalLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || code.trim().length !== 6) {
      setError('Enter your email or phone and the 6-digit access code.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/startup-studio/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), code: code.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.message || 'Invalid email/phone or access code.');
        return;
      }
      const dest = searchParams.get('redirectedFrom');
      router.replace(dest && dest.startsWith('/external') ? dest : '/external');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-white px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jkkn.png" alt="JKKN" className="mb-4 h-14 w-auto object-contain" />
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            Solve for 100 — Mentor &amp; Investor Access
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(6,78,59,0.12)] ring-1 ring-emerald-900/5">
          <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use the email or phone your coordinator registered, plus the 6-digit
            code they shared with you.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Email or phone
              </label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or 98xxxxxxxx"
                autoComplete="username"
                className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[15px] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                6-digit access code
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder="••••••"
                  autoComplete="one-time-code"
                  className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-center text-lg font-semibold tracking-[0.5em] outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-[15px] font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Don’t have a code? Contact your JKKN Solve-for-100 coordinator.
        </p>
      </div>
    </div>
  );
}
