'use client';

// The participant's account menu: avatar → Change password / Log out.
//
// Replaces a bare button in the header. On a phone the header had the person's
// name, their JKKN ID and an action button competing for one row; an avatar
// collapses all of it to a 36px target and puts the actions behind a tap.
//
// LOG OUT GOES TO /auth/participant-login, not /auth/login. That is the whole
// point of having this menu: a participant has no Google account, so the
// default sign-in page is a dead end for them — and proxy.ts would bounce them
// there on the next request if the redirect were left to the middleware.
//
// The dialog is CONTROLLED from here rather than owning its own trigger: a
// Radix dropdown closes on item select, which would unmount an uncontrolled
// trigger before the dialog could open.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, LogOut, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ChangePasswordDialog } from './change-password-dialog';

/** Up to two initials, so a one-word name does not render a lone letter beside
 *  a blank. Falls back to an icon when there is no usable name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function ParticipantMenu({
  participantName,
  jkknId,
}: {
  participantName: string;
  jkknId: string | null;
}) {
  const router = useRouter();
  const [changeOpen, setChangeOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const monogram = initials(participantName);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClientSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Even a failed sign-out should not strand them on a page they can no
      // longer use — the redirect below still moves them off it, and the
      // middleware will refuse the session on the next request either way.
      toast.error('Signed out locally, but the server could not be reached.');
    } finally {
      // replace(), not push(): Back must not return to a page whose session is
      // gone. refresh() clears the client router's cached authenticated render.
      router.replace('/auth/participant-login');
      router.refresh();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            aria-label="Account menu"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {monogram || <User className="h-4 w-4" />}
            </span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{participantName}</p>
            {jkknId && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{jkknId}</p>
            )}
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setChangeOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Change password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => void signOut()}
            disabled={signingOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Log out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </>
  );
}
