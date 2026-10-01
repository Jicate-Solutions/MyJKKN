'use client';

// "Sign out of all devices" on the person's own Profile page.
// Two steps on purpose: the first click only opens the confirm panel; nothing
// is signed out until "Yes, sign me out everywhere" is pressed.

import { useState, useTransition } from 'react';
import { LogOut, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { signOutEverywhere } from '../_actions/sign-out-everywhere';

export const SIGN_OUT_EVERYWHERE_WARNING =
  'This signs you out on every phone and computer, including this one.';

/** How long the "you're signed out" message stays before the sign-in page opens. */
const REDIRECT_DELAY_MS = 1500;

export function SignOutEverywhereCard() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await signOutEverywhere();
      if (!result.success) {
        setError(result.error);
        return;
      }
      // The server already ended every session and cleared this browser's
      // cookies; this clears the copy the page holds in memory.
      try {
        await createClientSupabaseClient().auth.signOut({ scope: 'local' });
      } catch {
        // Nothing left to clear — the hard navigation below starts fresh anyway.
      }
      setDone(true);
      setTimeout(() => {
        window.location.replace('/auth/login');
      }, REDIRECT_DELAY_MS);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <LogOut className='h-5 w-5' />
          Sign out of all devices
        </CardTitle>
        <CardDescription>
          Lost your phone, or signed in on a shared computer? End every login
          to your account in one step.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {done ? (
          <div
            role='status'
            className='flex items-start gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm'
          >
            <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-green-600' />
            <span>
              You are signed out on every device. Taking you to the sign-in
              page…
            </span>
          </div>
        ) : confirming ? (
          <div className='space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3'>
            <p className='flex items-start gap-2 text-sm font-medium'>
              <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
              {SIGN_OUT_EVERYWHERE_WARNING}
            </p>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Button
                variant='destructive'
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? 'Signing out…' : 'Yes, sign me out everywhere'}
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant='outline' onClick={() => setConfirming(true)}>
            <LogOut className='mr-2 h-4 w-4' />
            Sign out of all devices
          </Button>
        )}

        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
