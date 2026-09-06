'use client';

// Sign-in for external course participants.
//
// A separate page from /auth/login on purpose. That page is Google OAuth only,
// which is right for staff and learners and useless to someone who applied to a
// paid course from the public site: they have no Google account, usually no
// email at all, and what they were given is a JKKN ID and a temporary password.
//
// The JKKN ID is not an auth identity — Supabase Auth needs an email or a
// phone. The resolution from one to the other happens entirely inside
// /api/auth/participant-login and never reaches this component, because a page
// that could turn a JKKN ID into an account would be an enumeration oracle over
// a six-digit space.
//
// Public route: registered in proxy.ts, in BOTH the allow-list and the matcher
// exclusion, or the middleware would bounce an unauthenticated visitor to
// /auth/login before this page ever rendered.
//
// Carries its own <Toaster>: like the public course pages, this route does not
// mount the authenticated shell, so without one every error would be invisible.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';
import { GraduationCap, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ParticipantLoginPage() {
  const router = useRouter();
  const [jkknId, setJkknId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/participant-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jkknId, password }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? 'Could not sign you in. Please try again.');
        return;
      }

      // refresh() as well as push(): the session cookie was set by the route
      // handler, and without a refresh the client router can serve a cached
      // unauthenticated render of the destination.
      router.push(json.redirectTo ?? '/my-courses');
      router.refresh();
    } catch {
      toast.error('Could not reach the server. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="h-1.5 w-full bg-primary" />

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
        <div className="mb-6 text-center">
          <GraduationCap className="mx-auto h-9 w-9 text-primary" />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            JKKN Institutions
          </p>
          <h1 className="mt-1 text-2xl font-bold">Course participant sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the JKKN ID and password you were sent when your application was
            accepted.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-lg border p-5">
          <div className="space-y-1.5">
            <Label htmlFor="jkkn-id">JKKN ID</Label>
            <Input
              id="jkkn-id"
              value={jkknId}
              onChange={(e) => setJkknId(e.target.value)}
              placeholder="391840-6"
              inputMode="numeric"
              autoComplete="username"
              autoFocus
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="participant-password">Password</Label>
            <Input
              id="participant-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting || !jkknId || !password}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>

          {/* No "forgot password" link. A participant with no email address has
              no self-service reset path, so offering one would dead-end them.
              The institution reissues it. */}
          <p className="text-center text-xs text-muted-foreground">
            Lost your password? Contact the institution that runs your course —
            they can issue a new one.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Staff and learners sign in{' '}
          <Link href="/auth/login" className="underline">
            here
          </Link>
          .
        </p>
      </main>

      <Toaster richColors position="top-center" />
    </div>
  );
}
