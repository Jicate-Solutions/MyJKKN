/**
 * Online Meetings — the guest page.
 *
 * Route: /join/[token]. PUBLIC BY DESIGN, and allow-listed in proxy.ts under
 * the '/join/' prefix. Without that entry this page would be 307'd to the
 * login screen before it ever rendered, which is exactly how '/verify/' and
 * '/r/' each shipped broken. Being under app/(public)/ is not what makes a
 * page reachable — the allow-list is.
 *
 * An external guest has no MyJKKN account by definition. The token in the URL
 * IS their identity, so there is no sign-in, no sidebar, and nothing on this
 * page that assumes a session. It is deliberately the only JKKN surface such a
 * person ever sees.
 *
 * The read runs as service role because `anon` is revoked on every
 * online_meeting* table. `resolveParticipantByToken` is what authorises it, and
 * it refuses an unknown token, a token aimed at the wrong meeting, a cancelled
 * meeting, and a meeting outside its join window. Read that function before
 * changing anything here.
 */

import { CalendarX } from 'lucide-react';

import { LiveConsole } from '@/components/online-meetings/live-console';
import { Card, CardContent } from '@/components/ui/card';
import {
  getLiveMeeting,
  resolveParticipantByToken,
} from '@/lib/services/online-meetings/live-service';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

function GuestShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <p className="text-sm font-semibold">JKKN &middot; Online Meeting</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 pt-2">
        <p className="text-xs text-muted-foreground">
          This page is personal to you. Please do not forward the link &mdash;
          anyone who opens it is recorded as you.
        </p>
      </footer>
    </div>
  );
}

export default async function GuestJoinPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const who = await resolveParticipantByToken(supabase, token);
  if (!who.ok) {
    // One message for every failure mode. Saying "this token exists but the
    // meeting ended" would let the token space answer questions about itself.
    return (
      <GuestShell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <CalendarX className="h-9 w-9 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">This invitation link is not active</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              It may have expired, been replaced, or the meeting may have been
              cancelled. Please ask your host to send you a new link.
            </p>
          </CardContent>
        </Card>
      </GuestShell>
    );
  }

  const live = await getLiveMeeting(supabase, who.data);
  if (!live.ok) {
    return (
      <GuestShell>
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            This meeting could not be loaded. Please try the link again shortly.
          </CardContent>
        </Card>
      </GuestShell>
    );
  }

  return (
    <GuestShell>
      <LiveConsole
        initial={live.data}
        transport={{ base: '/api/public/online-meetings/live', joinToken: token }}
      />
    </GuestShell>
  );
}
