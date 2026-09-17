// app/(routes)/meetings/record/page.tsx
//
// Record a meeting that is happening in a room.
//
// WHY THIS PAGE EXISTS
// Of the 50 meetings the Fireflies notetaker handled in the 30 days to 14 Sep
// 2026, 29 came back EMPTY. Those were not bot failures — they were meetings
// held at a table, where the bot joined an abandoned Meet link and left. Google's
// own Gemini notes have nothing for those slots either. A notetaker that joins
// calls cannot hear a room, and most of JKKN's meetings happen in one.
//
// Gated by name, not by role (Director, 15 Sep). fn_may_record_meetings() runs as
// the caller, so row-level security is what keeps the answer to their own row —
// this page can ask "may I?" and cannot learn who else may.
//
// Follows rule #27: a person without permission sees an explicit explanation,
// never a silent redirect that leaves them guessing.
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { MeetingRecorder } from './_components/meeting-recorder';

export const dynamic = 'force-dynamic';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Record a meeting">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Record' },
        ]}
      />
      <div className="mt-4 space-y-4">
        <PageHeader
          title="Record a meeting"
          description="For a meeting in a room. Your phone records it, and the audio is saved as it goes."
        />
        <div className="max-w-xl">{children}</div>
      </div>
    </ContentLayout>
  );
}

interface RecordPageProps {
  /** ?booking=<uid> — arrives from the Record button on a meeting's own page. */
  searchParams: Promise<{ booking?: string }>;
}

export default async function MeetingRecordPage({ searchParams }: RecordPageProps) {
  const { booking: bookingUid } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="font-medium">You are signed out.</p>
            <p className="text-muted-foreground">Sign in to record a meeting.</p>
            <Link href="/login" className="inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { data: mayRecord, error } = await supabase.rpc('fn_may_record_meetings');

  if (error) {
    // Say what went wrong. A permission check that fails is not a "no".
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <p className="font-medium">Could not check whether you can record.</p>
            <p className="text-muted-foreground">
              Reload the page. If it keeps happening, tell an administrator —
              recording is not switched off, the check itself failed.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // The meeting this recording belongs to, when the page was opened from one.
  // Read through the session client, so a uid the viewer does not host reads as
  // absent and the page records standalone rather than leaking that it exists.
  let attachedTo: { id: string; label: string; whenText: string } | null = null;
  let bookingMissing = false;
  if (bookingUid) {
    const { data: row } = await supabase
      .from('meeting_bookings')
      .select('id, uid, attendee_name, start_time, meeting_type_id')
      .eq('uid', bookingUid)
      .maybeSingle();
    if (row) {
      const b = row as Record<string, unknown>;
      const { data: mt } = await supabase
        .from('meeting_types')
        .select('title')
        .eq('id', b.meeting_type_id as string)
        .maybeSingle();
      const who = (b.attendee_name as string | null) ?? null;
      const what = ((mt as Record<string, unknown> | null)?.title as string | null) ?? 'Meeting';
      attachedTo = {
        id: b.id as string,
        label: who ? `${what} with ${who}` : what,
        whenText: formatWhen(b.start_time as string | null),
      };
    } else {
      bookingMissing = true;
    }
  }

  return (
    <Shell>
      <Card>
        <CardContent className="pt-6">
          <MeetingRecorder canRecord={mayRecord === true} attachedTo={attachedTo} />
        </CardContent>
      </Card>
      {bookingMissing ? (
        <p className="mt-4 text-sm text-muted-foreground">
          That meeting could not be found, so this recording will be saved on its own rather
          than against it. You can still record.
        </p>
      ) : null}
      <p className="mt-4 text-xs text-muted-foreground">
        Audio is stored privately and kept for 90 days, then deleted. The written
        notes are kept.
      </p>
    </Shell>
  );
}
