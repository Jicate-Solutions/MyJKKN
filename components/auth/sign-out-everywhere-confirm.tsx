'use client';

// "Sign out of all devices" — the ONE confirm step for a person's own account.
// Director ruling 2026-10-01: logins last forever on the installed app; the
// safety net for a lost or shared phone is this button. Rendered in three
// places so people find it where they already look for "Sign out":
//   - the user menu (top right, next to "Sign out") — components/Navbar/user-nav.tsx
//   - the Profile page card — app/(routes)/profile/_components/sign-out-everywhere-card.tsx
//   - the learners' profile page (/learn/profile), same card
// Nothing is signed out until "Yes, sign me out everywhere" is pressed.

import { useState, useTransition } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { signOutEverywhere } from '@/app/(routes)/profile/_actions/sign-out-everywhere';
import { SIGNED_OUT_EVERYWHERE_NOTICE } from '@/lib/auth/sign-out-everywhere-copy';

export { SIGNED_OUT_EVERYWHERE_NOTICE };

export const SIGN_OUT_EVERYWHERE_WARNING =
  'This signs you out on every phone and computer, including this one.';

/** How long the success message stays before the sign-in page opens. */
const REDIRECT_DELAY_MS = 2500;

export function SignOutEverywhereConfirm({ onCancel }: { onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await signOutEverywhere();
      if (result.success === false) {
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

  if (done) {
    return (
      <div
        role='status'
        className='flex items-start gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm'
      >
        <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-green-600' />
        <span>
          {SIGNED_OUT_EVERYWHERE_NOTICE} Taking you to the sign-in page…
        </span>
      </div>
    );
  }

  return (
    <div className='space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3'>
      <p className='flex items-start gap-2 text-sm font-medium'>
        <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
        {SIGN_OUT_EVERYWHERE_WARNING}
      </p>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Button variant='destructive' onClick={handleConfirm} disabled={isPending}>
          {isPending ? 'Signing out…' : 'Yes, sign me out everywhere'}
        </Button>
        <Button
          variant='outline'
          onClick={() => {
            setError(null);
            onCancel();
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
    </div>
  );
}
