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
// Gated by name, not by role (Director, 15 Sep). fn_may_record_meetings() answers
// only about the caller, so this page can ask "may I?" without being able to read
// who else may.
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

export default async function MeetingRecordPage() {
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

  return (
    <Shell>
      <Card>
        <CardContent className="pt-6">
          <MeetingRecorder canRecord={mayRecord === true} />
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Audio is stored privately and kept for 90 days, then deleted. The written
        notes are kept.
      </p>
    </Shell>
  );
}
