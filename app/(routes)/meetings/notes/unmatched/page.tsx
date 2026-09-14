// app/(routes)/meetings/notes/unmatched/page.tsx
//
// The unmatched list — meeting notes that arrived from Fireflies carrying no
// identifier MyJKKN recognises, waiting for a human to say which meeting they
// belong to.
//
// ── WHY THIS PAGE EXISTS AT ALL ─────────────────────────────────────────────
// The ingest attaches a note to a meeting on exactly one condition: Fireflies'
// calendar id equals a meeting_bookings.google_event_id, and exactly one
// booking holds it. Everything else lands here. That rule is deliberately
// narrow, which means this list is expected to have things in it — it is the
// designed outcome of refusing to guess, not a backlog of failures.
//
// ── ACCESS (rule #27 — an explicit refusal, never a silent redirect) ─────────
//   is_super_admin OR is_admin OR meetings.series.manage.
// The same three are what the RLS policy on meeting_notes admits to an
// unmatched row, and what fn_link_meeting_note() checks before it writes.
// This gate produces a readable refusal; RLS is what makes the refusal true
// even if this file is wrong.
//
// ── WHY THE SERVICE ROLE READS THE NOTES ────────────────────────────────────
// An unmatched note is visible under RLS to admins and to meetings.series.manage
// holders — which is exactly who reaches this page. The service-role read is
// here so the booking picker can offer meetings across every institution: the
// caller's session client would filter that list by their own institution
// access and quietly hide the very meeting a note belongs to. The gate above is
// what makes that safe, and nothing below is rendered to anyone who failed it.

import { AlertCircle, FileText, Inbox } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { badgeVariants } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

import { LinkNoteButton, type BookingOption } from './_components/link-note-button';

export const dynamic = 'force-dynamic';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Meetings', href: '/meetings/inbox' },
  { label: 'Unmatched notes' },
];

/** How many past/upcoming bookings the picker offers. */
const BOOKING_CHOICES = 200;

interface UnmatchedNote {
  id: string;
  title: string | null;
  summary: string | null;
  occurred_at: string | null;
  duration_minutes: number | null;
  transcript_url: string | null;
  recording_url: string | null;
}

function formatWhen(value: string | null): string {
  if (!value) return 'No date recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date recorded';
  return parsed.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function AccessDenied() {
  return (
    <ContentLayout title="Unmatched meeting notes">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mt-8 flex justify-center">
        <Card className="w-full max-w-md rounded-2xl border-neutral-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You don&apos;t have access to this page</h3>
            <p className="text-xs text-muted-foreground">
              Contact an administrator to request the{' '}
              <code className="rounded bg-muted px-1">meetings.series.manage</code> permission.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default async function UnmatchedMeetingNotesPage() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return <AccessDenied />;
  }

  const [{ data: isSuperAdmin }, { data: isAdmin }, { data: hasPerm }] = await Promise.all([
    sessionClient.rpc('is_super_admin'),
    sessionClient.rpc('is_admin'),
    sessionClient.rpc('user_has_permission', {
      permission_name: 'meetings.series.manage',
    }),
  ]);

  if (!isSuperAdmin && !isAdmin && !hasPerm) {
    return <AccessDenied />;
  }

  const serviceClient = createServiceRoleClient();

  const [notesResult, bookingsResult] = await Promise.all([
    serviceClient
      .from('meeting_notes')
      .select('id, title, summary, occurred_at, duration_minutes, transcript_url, recording_url')
      .is('booking_id', null)
      .order('occurred_at', { ascending: false, nullsFirst: false }),
    serviceClient
      .from('meeting_bookings')
      .select(
        'id, attendee_name, start_time, meeting_types:meeting_type_id(title), profiles:host_profile_id(full_name)',
      )
      .order('start_time', { ascending: false })
      .limit(BOOKING_CHOICES),
  ]);

  const notes = (notesResult.data ?? []) as UnmatchedNote[];

  // A booking row's joined relations arrive as an object or (for some PostgREST
  // shapes) a one-element array. Read both rather than assume, so a picker
  // entry never renders as "undefined with undefined".
  const pickOne = (value: unknown): Record<string, unknown> | null => {
    if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
    if (value && typeof value === 'object') return value as Record<string, unknown>;
    return null;
  };

  const bookings: BookingOption[] = (bookingsResult.data ?? []).map((row: Record<string, any>) => {
    const meetingType = pickOne(row.meeting_types);
    const host = pickOne(row.profiles);
    return {
      id: String(row.id),
      title: (meetingType?.title as string) ?? 'Meeting',
      hostName: (host?.full_name as string) ?? 'Unknown host',
      attendeeName: (row.attendee_name as string) ?? 'Unknown attendee',
      startsAt: (row.start_time as string) ?? null,
    };
  });

  const loadFailed = Boolean(notesResult.error);

  return (
    <ContentLayout title="Unmatched meeting notes">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mt-4 space-y-6">
        <PageHeader
          title="Unmatched meeting notes"
          description="Notes that arrived from Fireflies without an identifier MyJKKN recognises. Nothing is matched by guesswork — pick the meeting each one belongs to."
        />

        {loadFailed ? (
          <Card className="rounded-2xl border-destructive/30">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive/60" aria-hidden />
              <h3 className="text-sm font-medium">Could not load the notes</h3>
              <p className="text-xs text-muted-foreground">{notesResult.error?.message}</p>
            </CardContent>
          </Card>
        ) : notes.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <h3 className="text-sm font-medium">Nothing waiting</h3>
              <p className="text-xs text-muted-foreground">
                Every note that has arrived is already on a meeting.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {notes.length} {notes.length === 1 ? 'note is' : 'notes are'} waiting to be linked.
            </p>

            {notes.map((note) => (
              <Card key={note.id} className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{note.title ?? 'Untitled notes'}</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(note.occurred_at)}
                      {note.duration_minutes != null && ` · ${note.duration_minutes} min`}
                    </p>
                  </div>
                  <LinkNoteButton
                    noteId={note.id}
                    noteTitle={note.title ?? 'Untitled notes'}
                    bookings={bookings}
                  />
                </CardHeader>

                {(note.summary || note.transcript_url || note.recording_url) && (
                  <CardContent className="space-y-3 pt-0">
                    {note.summary && (
                      <p className="line-clamp-3 text-sm text-muted-foreground">{note.summary}</p>
                    )}
                    {/* `Badge` renders a <div> and has no asChild, so the link
                        borrows its classes rather than wrapping it — a <div>
                        around an <a> would swallow the click target. */}
                    <div className="flex flex-wrap gap-2">
                      {note.transcript_url && (
                        <a
                          href={note.transcript_url}
                          target="_blank"
                          rel="noreferrer"
                          className={badgeVariants({ variant: 'outline' })}
                        >
                          Transcript
                        </a>
                      )}
                      {note.recording_url && (
                        <a
                          href={note.recording_url}
                          target="_blank"
                          rel="noreferrer"
                          className={badgeVariants({ variant: 'outline' })}
                        >
                          Recording
                        </a>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
