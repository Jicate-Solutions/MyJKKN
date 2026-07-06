'use client';

/**
 * /schools-portal/verify?token=…
 *
 * Lands here after the HM clicks the magic-link in their email. We POST the
 * token to /api/schools-portal/auth/verify which (on success) sets the
 * school_portal_session cookie and returns { ok, schoolName }. We then push
 * the browser to /schools-portal/dashboard.
 *
 * If the token is invalid/expired/already-consumed, surface a clear error
 * + "send me a new link" CTA. No silent redirect (per CLAUDE.md rule #27).
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SchoolsPortalVerifyPage() {
  return (
    <Suspense fallback={<VerifyShell />}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        {children ?? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-[#0b6d41]" />
            <p className="text-sm text-muted-foreground">
              Verifying your sign-in link…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<
    'verifying' | 'ok' | 'invalid' | 'missing'
  >(token ? 'verifying' : 'missing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('missing');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/schools-portal/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setErrorMessage(json.error || 'Invalid or expired link');
          setState('invalid');
          return;
        }
        setState('ok');
        // Small delay so the user sees "Signed in" briefly.
        router.replace('/schools-portal/dashboard');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Network error');
        setState('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  if (state === 'verifying') {
    return <VerifyShell />;
  }

  if (state === 'ok') {
    return (
      <VerifyShell>
        <div className="flex flex-col items-center gap-2 py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[#0b6d41]" />
          <p className="text-sm text-muted-foreground">
            Signed in. Loading your portal…
          </p>
        </div>
      </VerifyShell>
    );
  }

  // missing or invalid
  return (
    <VerifyShell>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-rose-100 p-2 text-rose-700">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-[#11243a]">
          {state === 'missing'
            ? 'No sign-in token in this link'
            : 'Link no longer valid'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {state === 'missing'
            ? 'Open the most recent email we sent you and click the button there.'
            : (errorMessage ??
              'This sign-in link has already been used, has expired, or was tampered with.')}
        </p>
        <div className="mt-2 flex gap-2">
          <Button
            asChild
            className="bg-[#0b6d41] hover:bg-[#0e7a49]"
          >
            <Link href="/schools-portal/login">Request a new link</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to JKKN</Link>
          </Button>
        </div>
      </div>
    </VerifyShell>
  );
}
