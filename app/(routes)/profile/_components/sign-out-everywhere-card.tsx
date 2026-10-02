'use client';

// "Sign out of all devices" card — on the Profile page and on the learners'
// profile page (/learn/profile). Two steps on purpose: the first click only
// opens the confirm panel (shared with the user menu); nothing is signed out
// until "Yes, sign me out everywhere" is pressed.

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  SignOutEverywhereConfirm,
  SIGN_OUT_EVERYWHERE_WARNING,
  SIGNED_OUT_EVERYWHERE_NOTICE
} from '@/components/auth/sign-out-everywhere-confirm';

export { SIGN_OUT_EVERYWHERE_WARNING, SIGNED_OUT_EVERYWHERE_NOTICE };

export function SignOutEverywhereCard() {
  const [confirming, setConfirming] = useState(false);

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
        {confirming ? (
          <SignOutEverywhereConfirm onCancel={() => setConfirming(false)} />
        ) : (
          <Button variant='outline' onClick={() => setConfirming(true)}>
            <LogOut className='mr-2 h-4 w-4' />
            Sign out of all devices
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
