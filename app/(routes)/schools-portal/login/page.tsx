'use client';

/**
 * /schools-portal/login — email entry for the magic-link flow.
 *
 * Submits to POST /api/schools-portal/auth/request-link. Always shows the
 * same "Check your email" success screen regardless of whether the email
 * matched a portal-eligible contact (no enumeration). In non-production we
 * surface the debug link returned by the API so a developer can complete
 * the flow without Resend configured.
 */
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SchoolsPortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Enter your email');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/schools-portal/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        debugLink?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error(json.error || 'Could not send link');
        return;
      }
      setSent(true);
      if (json.debugLink) setDebugLink(json.debugLink);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-md py-10">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-[#0b6d41]/10 p-2 text-[#0b6d41]">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#11243a]">
                Check your email
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                If the address you entered is on file as a school contact,
                a sign-in link has been sent to it. The link is valid for the
                next 15 minutes and can be used only once.
              </p>
              {debugLink && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">Dev mode (no email sent):</p>
                  <a
                    href={debugLink}
                    className="break-all font-mono text-amber-900 underline"
                  >
                    {debugLink}
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setDebugLink(null);
              }}
              className="text-[#0b6d41] hover:underline"
            >
              Use a different email
            </button>
            <Link
              href="/"
              className="text-muted-foreground hover:text-[#11243a]"
            >
              Back to JKKN
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h1 className="text-xl font-semibold text-[#11243a]">
          Sign in to your school portal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the email address you have on file with JKKN. We'll send a
          one-time sign-in link.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.school"
              autoComplete="email"
              required
              className="mt-1 h-11 rounded-lg"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-lg bg-[#0b6d41] text-base font-semibold hover:bg-[#0e7a49]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending link…
              </>
            ) : (
              'Send sign-in link'
            )}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Not your portal?{' '}
          <Link href="/" className="text-[#0b6d41] hover:underline">
            Back to JKKN
          </Link>
        </p>
      </div>
    </div>
  );
}
