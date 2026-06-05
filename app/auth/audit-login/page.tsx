'use client';

/**
 * Payment-Gateway Audit Login
 *
 * Dedicated email+password login route for the Razorpay payment-gateway security audit.
 * Deliberately separate from /auth/login (Google-only), /auth/test-login (dev-only),
 * and /auth/lti-login (MathWorks LTI). Modeled on /auth/lti-login.
 *
 * Why this exists:
 *   - /auth/login only offers Google OAuth, which triggers @jkkn.ac.in Workspace MFA
 *     for external logins — blocking Razorpay's auditors from signing in.
 *   - /auth/test-login is hard-blocked in production and exposes 20+ one-click roles.
 *   - This route provides a minimal, production-safe, feature-flagged password login
 *     restricted by an explicit email allow-list to the seeded audit account.
 *
 * Access controls (defense in depth):
 *   1. Feature flag `NEXT_PUBLIC_ENABLE_PAYMENT_AUDIT_LOGIN=true` must be set at build time.
 *   2. Email MUST be in AUDIT_ALLOWED_EMAILS — enforced in the UI.
 *   3. The account is scoped to JKKN Testing Institution only
 *      (payment_audit_admin role, institution_scope='own') — it cannot see other
 *      institutions' data even after signing in.
 *   4. Disable the flag and the account after audit sign-off, and rotate the password.
 */

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2, LogIn, Lock, Info } from 'lucide-react';
import { toast } from 'sonner';

// Explicit allow-list (lowercase). Tighter than a regex — only these exact
// accounts can sign in here even with the flag on.
const AUDIT_ALLOWED_EMAILS = new Set(['test.admin@jkkn.ac.in']);

// Inner component uses `useSearchParams()` — MUST be wrapped in <Suspense>
// per Next.js 16 prerender requirements (same pattern as /auth/lti-login).
function AuditLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Land the auditor straight on the billing students page (the payment area).
  const redirectTarget = searchParams?.get('redirectedFrom') || '/billing/schedule/students';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (data?.user?.email && AUDIT_ALLOWED_EMAILS.has(data.user.email.toLowerCase())) {
        router.replace(redirectTarget);
        return;
      }
      setCheckingSession(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [redirectTarget, router, supabase]);

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (!AUDIT_ALLOWED_EMAILS.has(trimmedEmail)) {
      setError(
        'This page only accepts the dedicated payment-audit account. ' +
          'Regular accounts should use the main login page.'
      );
      return;
    }

    if (!password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);

    await supabase.auth.signOut();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      toast.success(`Signed in as ${trimmedEmail}`);
      router.push(redirectTarget);
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-teal-600 to-emerald-600 rounded-2xl shadow-sm">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold">Payment Gateway Audit Login</h1>
        <p className="text-sm text-muted-foreground">
          Email + password sign-in for the Razorpay payment-gateway security audit
        </p>
      </div>

      {/* Context banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs leading-relaxed">
          This page accepts <strong>only</strong> the dedicated audit account provided to the
          Razorpay team. For all other access, use{' '}
          <a href="/auth/login" className="underline">
            the main login page
          </a>
          .
        </AlertDescription>
      </Alert>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription className="text-xs">
            Credentials were shared via secure channel by your MyJKKN contact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="audit-email">Email</Label>
              <Input
                id="audit-email"
                type="email"
                autoComplete="email"
                placeholder="test.admin@jkkn.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-password">Password</Label>
              <Input
                id="audit-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign in
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-[11px] text-center text-muted-foreground">
        This route is feature-flagged and will be disabled after the payment-gateway audit sign-off.
      </p>
    </div>
  );
}

// Lightweight fallback shown while the Content hydrates.
function AuditLoginFallback() {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-teal-600 to-emerald-600 rounded-2xl shadow-sm">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold">Payment Gateway Audit Login</h1>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

export default function AuditLoginPage() {
  // Feature flag is evaluated here (outside Suspense) so the "disabled" message
  // renders instantly on SSG without waiting for searchParams hydration.
  if (!FEATURE_FLAGS.ENABLE_PAYMENT_AUDIT_LOGIN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payment audit login is disabled</AlertTitle>
          <AlertDescription>
            This route is only enabled during the active Razorpay payment-gateway audit. Contact your
            MyJKKN administrator if you were expecting access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <Suspense fallback={<AuditLoginFallback />}>
        <AuditLoginContent />
      </Suspense>
    </div>
  );
}
