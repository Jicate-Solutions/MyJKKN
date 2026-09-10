'use client';

/**
 * Online Meetings — the detail tabs.
 *
 * Overview, Participants, Polls, Agenda, Minutes, Actions, Report. One client
 * island because they share the meeting object and the host flag; splitting
 * them would mean seven components each re-deriving the same two things.
 *
 * `isHost` gates what is OFFERED here. Every write still goes through a server
 * action that checks permission and an RLS policy that checks it again.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Building2,
  CalendarClock,
  Check,
  Copy,
  Link2,
  Loader2,
  Mail,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type {
  MeetingActionItem,
  MeetingAgendaItem,
  MeetingMinutes,
  MeetingParticipant,
  MeetingPollWithCount,
  MeetingReport,
  OnlineMeeting,
} from '@/lib/services/online-meetings/types';

import {
  addActionItemAction,
  addAgendaItemAction,
  closePollAction,
  createPollAction,
  inviteExternalAction,
  regenerateJoinLinkAction,
  removeAgendaItemAction,
  removeParticipantAction,
  saveMinutesAction,
  sendInvitesAction,
  updateActionItemStatusAction,
} from '../../_actions/meeting-actions';
import { safeMeetingHref } from '@/lib/services/online-meetings/meeting-url';

import { InviteColleagues } from './invite-colleagues';
import { MeetingLinkEditor } from './meeting-link-editor';
import { QuizEditor } from './quiz-editor';

interface Props {
  meeting: OnlineMeeting;
  isHost: boolean;
  participants: MeetingParticipant[];
  participantsError: string | null;
  polls: MeetingPollWithCount[];
  agenda: MeetingAgendaItem[];
  minutes: MeetingMinutes | null;
  actionItems: MeetingActionItem[];
  report: MeetingReport | null;
  /** Whether the host has an active Google Calendar connection. */
  googleConnected: boolean;
  /** Microsoft Graph credentials present on this deployment. */
  teamsConfigured: boolean;
}

function joinUrl(token: string): string {
  if (typeof window === 'undefined') return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

export function MeetingDetailTabs(props: Props) {
  const { meeting, isHost } = props;
  // Controlled so the Overview's "invite your team" call to action can move the
  // host to the right tab. A prompt that tells somebody where to go, without
  // taking them there, is only half an answer.
  const [tab, setTab] = useState('overview');

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="participants">
          Participants ({props.participants.length})
        </TabsTrigger>
        <TabsTrigger value="polls">Polls ({props.polls.length})</TabsTrigger>
        <TabsTrigger value="quiz">Quiz</TabsTrigger>
        <TabsTrigger value="agenda">Agenda ({props.agenda.length})</TabsTrigger>
        <TabsTrigger value="minutes">Minutes</TabsTrigger>
        <TabsTrigger value="actions">Actions ({props.actionItems.length})</TabsTrigger>
        <TabsTrigger value="report">Report</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <OverviewTab
          meeting={meeting}
          report={props.report}
          isHost={isHost}
          googleConnected={props.googleConnected}
          teamsConfigured={props.teamsConfigured}
          participantCount={props.participants.length}
          onGoToParticipants={() => setTab('participants')}
        />
      </TabsContent>
      <TabsContent value="participants" className="mt-4">
        <ParticipantsTab
          meeting={meeting}
          isHost={isHost}
          participants={props.participants}
          error={props.participantsError}
        />
      </TabsContent>
      <TabsContent value="polls" className="mt-4">
        <PollsTab meeting={meeting} isHost={isHost} polls={props.polls} />
      </TabsContent>
      <TabsContent value="quiz" className="mt-4">
        <QuizEditor meeting={meeting} isHost={isHost} />
      </TabsContent>
      <TabsContent value="agenda" className="mt-4">
        <AgendaTab meeting={meeting} isHost={isHost} items={props.agenda} />
      </TabsContent>
      <TabsContent value="minutes" className="mt-4">
        <MinutesTab meeting={meeting} isHost={isHost} minutes={props.minutes} />
      </TabsContent>
      <TabsContent value="actions" className="mt-4">
        <ActionsTab
          meeting={meeting}
          isHost={isHost}
          items={props.actionItems}
          participants={props.participants}
        />
      </TabsContent>
      <TabsContent value="report" className="mt-4">
        <ReportTab report={props.report} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------

function OverviewTab({
  meeting,
  report,
  isHost,
  googleConnected,
  teamsConfigured,
  participantCount,
  onGoToParticipants,
}: {
  meeting: OnlineMeeting;
  report: MeetingReport | null;
  isHost: boolean;
  googleConnected: boolean;
  teamsConfigured: boolean;
  participantCount: number;
  onGoToParticipants: () => void;
}) {
  const tz = meeting.timezone || 'Asia/Kolkata';
  // One participant means the host alone — the row every meeting gets on
  // creation so its own host can join. That reads as "1 invited" everywhere
  // and looks like a populated meeting, which is exactly how somebody ends up
  // sitting in an empty call. Say it plainly instead.
  const nobodyInvited = participantCount <= 1;
  // Never trust the stored value as an href. See lib/services/online-meetings/
  // meeting-url.ts: this field is host-typed free text and reaches guests.
  const safeLink = safeMeetingHref(meeting.meet_url);

  return (
    <div className="space-y-4">
      {isHost && nobodyInvited && meeting.status !== 'cancelled' && (
        <Card className="border-amber-500/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">You have not invited anyone yet</p>
              <p className="text-xs text-muted-foreground">
                Only you are on this meeting. Add colleagues by name, a whole
                department, or outside guests who have no MyJKKN account.
              </p>
            </div>
            <Button size="sm" onClick={onGoToParticipants} className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Invite your team
            </Button>
          </CardContent>
        </Card>
      )}

      {isHost && (
        <MeetingLinkEditor
          meeting={meeting}
          googleConnected={googleConnected}
          teamsConfigured={teamsConfigured}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">When and where</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {new Date(meeting.starts_at).toLocaleString('en-IN', {
              timeZone: tz,
              dateStyle: 'full',
              timeStyle: 'short',
            })}
            {' – '}
            {new Date(meeting.ends_at).toLocaleTimeString('en-IN', {
              timeZone: tz,
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {safeLink ? (
            // A div, not a p. Badge renders a <div>, and a <div> inside a <p>
            // is invalid HTML: the browser closes the paragraph early, so the
            // server markup and the client tree disagree and React throws a
            // hydration error. Any row that mixes text with a Badge, a Button
            // or a Tooltip needs the same treatment.
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <a
                href={safeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-primary hover:underline"
              >
                {safeLink}
              </a>
              <Badge variant="outline" className="shrink-0">
                {meeting.meet_source === 'teams'
                  ? 'Microsoft Teams'
                  : meeting.meet_source === 'google'
                    ? 'Google Meet'
                    : 'Pasted'}
              </Badge>
            </div>
          ) : meeting.meet_url ? (
            // A stored value that is not an http(s) URL. Shown as inert text
            // rather than hidden, so the host can see what is there and fix it,
            // and never as a link, so it cannot execute.
            <p className="text-destructive">
              The stored link is not a valid web address and has been disabled:{' '}
              <span className="break-all font-mono text-xs">{meeting.meet_url}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              No video link yet. Attendance is still recorded without one.
              {isHost ? ' Add one above.' : ''}
            </p>
          )}
          {meeting.description && (
            <p className="pt-2 leading-relaxed">{meeting.description}</p>
          )}
          {meeting.status === 'cancelled' && (
            <p className="pt-2 text-destructive">
              Cancelled: {meeting.cancellation_reason}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">At a glance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {report ? (
            <>
              <p>{report.totals.invited} invited</p>
              <p>{report.totals.joined} joined</p>
              <p>
                {report.totals.internal_joined} colleagues,{' '}
                {report.totals.external_joined} guests
              </p>
              <p>
                {report.totals.engagement_rate === null
                  ? 'This meeting measures presence only.'
                  : `${report.totals.engagement_rate}% of those who joined met every measure.`}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">No figures yet.</p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ParticipantsTab({
  meeting,
  isHost,
  participants,
  error,
}: {
  meeting: OnlineMeeting;
  isHost: boolean;
  participants: MeetingParticipant[];
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestOrg, setGuestOrg] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  function addGuest() {
    if (!guestName.trim()) {
      toast.error('A guest needs a name.');
      return;
    }
    startTransition(async () => {
      const r = await inviteExternalAction(meeting.id, meeting.institution_id, [
        { name: guestName, email: guestEmail || null, organization: guestOrg || null },
      ]);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(r.data.added > 0 ? 'Guest invited.' : 'That guest is already invited.');
      setGuestName('');
      setGuestEmail('');
      setGuestOrg('');
      router.refresh();
    });
  }

  function sendAll() {
    startTransition(async () => {
      const r = await sendInvitesAction(meeting.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      const sent = r.data.results.filter((x) => x.success).length;
      const skipped = r.data.results.filter((x) => x.skipped).length;
      const failed = r.data.results.filter((x) => !x.success && !x.skipped).length;
      // Skipped is reported separately and prominently. "Invitations sent" over
      // a silent skip is how somebody ends up not being told about a meeting.
      if (sent > 0) toast.success(`${sent} invitation(s) emailed.`);
      if (skipped > 0) {
        toast(
          `${skipped} person(s) have no email on file — copy their link below and send it yourself.`,
          { duration: 9000, icon: 'ℹ️' },
        );
      }
      if (failed > 0) toast.error(`${failed} invitation(s) could not be sent.`);
      router.refresh();
    });
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(joinUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-6 text-sm">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isHost && (
        <InviteColleagues
          meetingId={meeting.id}
          institutionId={meeting.institution_id}
        />
      )}

      {isHost && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invite an outside guest</CardTitle>
            <p className="text-xs text-muted-foreground">
              They need no MyJKKN account. Each guest gets a personal link that
              records their attendance the same way a colleague&rsquo;s is
              recorded.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="g-name">Name</Label>
                <Input
                  id="g-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-email">Email (optional)</Label>
                <Input
                  id="g-email"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-org">Organisation (optional)</Label>
                <Input
                  id="g-org"
                  value={guestOrg}
                  onChange={(e) => setGuestOrg(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addGuest} disabled={pending} size="sm" className="gap-1.5">
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                )}
                Add guest
              </Button>
              <Button
                onClick={sendAll}
                disabled={pending || participants.length === 0}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden />
                Email everyone their link
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invited</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {participants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nobody invited yet.
            </p>
          ) : (
            participants.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  {/* div, not p — see the note on the link row above. This one
                      only shows a Badge for external guests and for people
                      invited through a department, so it stayed invisible
                      until the roster actually had some. */}
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {p.display_name}
                    {p.participant_kind === 'external' && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" aria-hidden />
                        Guest
                      </Badge>
                    )}
                    {p.invited_via !== 'individual' && (
                      <Badge variant="secondary">via {p.invited_via}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.external_organization ? `${p.external_organization} · ` : ''}
                    {p.external_email ?? ''}
                    {p.external_email ? ' · ' : ''}
                    {p.invite_status}
                  </p>
                </div>
                {isHost && p.join_token && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => copyLink(p.join_token as string)}
                    >
                      {copied === p.join_token ? (
                        <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Copy link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        startTransition(async () => {
                          const r = await regenerateJoinLinkAction(meeting.id, p.id);
                          if (!r.success) toast.error(r.error);
                          else {
                            toast.success('A new link was issued. The old one no longer works.');
                            router.refresh();
                          }
                        })
                      }
                    >
                      Revoke link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        startTransition(async () => {
                          const r = await removeParticipantAction(meeting.id, p.id);
                          if (!r.success) toast.error(r.error);
                          else router.refresh();
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PollsTab({
  meeting,
  isHost,
  polls,
}: {
  meeting: OnlineMeeting;
  isHost: boolean;
  polls: MeetingPollWithCount[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  function issue() {
    startTransition(async () => {
      const r = await createPollAction(
        meeting.id,
        meeting.institution_id,
        question,
        options,
      );
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success('Poll issued.');
      setQuestion('');
      setOptions(['', '']);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {isHost && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Issue a poll</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-q">Question</Label>
              <Input
                id="p-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={o}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) =>
                    setOptions((prev) =>
                      prev.map((v, j) => (j === i ? e.target.value : v)),
                    )
                  }
                />
                {options.length > 2 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOptions((prev) => [...prev, ''])}
                disabled={options.length >= 8}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add option
              </Button>
              <Button size="sm" onClick={issue} disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                Issue poll
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {polls.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No polls yet.
          </CardContent>
        </Card>
      ) : (
        polls.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{p.question}</CardTitle>
                <div className="flex items-center gap-2">
                  {p.is_open && !p.closed_at ? (
                    <Badge>Open</Badge>
                  ) : (
                    <Badge variant="secondary">Closed</Badge>
                  )}
                  {isHost && p.is_open && !p.closed_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        startTransition(async () => {
                          const r = await closePollAction(p.id);
                          if (!r.success) toast.error(r.error);
                          else router.refresh();
                        })
                      }
                    >
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {p.options.map((o) => {
                const n = p.tallies[o.id] ?? 0;
                const pct = p.response_count > 0 ? Math.round((n / p.response_count) * 100) : 0;
                return (
                  <div key={o.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{o.label}</span>
                      <span className="text-muted-foreground">
                        {n} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-muted-foreground">
                {p.response_count} response(s)
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AgendaTab({
  meeting,
  isHost,
  items,
}: {
  meeting: OnlineMeeting;
  isHost: boolean;
  items: MeetingAgendaItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');

  return (
    <div className="space-y-4">
      {isHost && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add an agenda item</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What will be discussed"
              className="max-w-md"
            />
            <Input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Minutes"
              type="number"
              className="w-24"
            />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await addAgendaItemAction({
                    meetingId: meeting.id,
                    institutionId: meeting.institution_id,
                    title,
                    durationMin: minutes ? Number(minutes) : null,
                    sortOrder: items.length,
                  });
                  if (!r.success) toast.error(r.error);
                  else {
                    setTitle('');
                    setMinutes('');
                    router.refresh();
                  }
                })
              }
            >
              Add
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 py-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No agenda yet.
            </p>
          ) : (
            items.map((item, i) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {i + 1}. {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.duration_min ? `${item.duration_min} min` : 'No time set'}
                    {item.presenter_name ? ` · ${item.presenter_name}` : ''}
                  </p>
                </div>
                {isHost && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      startTransition(async () => {
                        const r = await removeAgendaItemAction(meeting.id, item.id);
                        if (!r.success) toast.error(r.error);
                        else router.refresh();
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MinutesTab({
  meeting,
  isHost,
  minutes,
}: {
  meeting: OnlineMeeting;
  isHost: boolean;
  minutes: MeetingMinutes | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState(minutes?.content ?? '');

  if (!isHost) {
    return (
      <Card>
        <CardContent className="py-6 text-sm">
          {minutes?.content ? (
            <p className="whitespace-pre-wrap leading-relaxed">{minutes.content}</p>
          ) : (
            <p className="text-muted-foreground">No minutes have been published yet.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Minutes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          placeholder="What was decided, and by whom."
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveMinutesAction({
                  meetingId: meeting.id,
                  institutionId: meeting.institution_id,
                  content,
                });
                if (!r.success) toast.error(r.error);
                else {
                  toast.success('Minutes saved.');
                  router.refresh();
                }
              })
            }
          >
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveMinutesAction({
                  meetingId: meeting.id,
                  institutionId: meeting.institution_id,
                  content,
                  publish: true,
                });
                if (!r.success) toast.error(r.error);
                else {
                  toast.success('Minutes published to everyone invited.');
                  router.refresh();
                }
              })
            }
          >
            Save and publish
          </Button>
        </div>
        {minutes?.published_at && (
          <p className="text-xs text-muted-foreground">
            Published{' '}
            {new Date(minutes.published_at).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ActionsTab({
  meeting,
  isHost,
  items,
  participants,
}: {
  meeting: OnlineMeeting;
  isHost: boolean;
  items: MeetingActionItem[];
  participants: MeetingParticipant[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');

  return (
    <div className="space-y-4">
      {isHost && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add an action item</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="a-title">What needs doing</Label>
              <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-owner">Owner</Label>
              <select
                id="a-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Nobody yet</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-due">Due</Label>
              <Input
                id="a-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await addActionItemAction({
                    meetingId: meeting.id,
                    institutionId: meeting.institution_id,
                    title,
                    // '' would be sent as a literal empty string and fail as an
                    // invalid uuid (22P02). Normalise, never coerce.
                    ownerParticipantId: owner || null,
                    dueDate: due || null,
                  });
                  if (!r.success) toast.error(r.error);
                  else {
                    setTitle('');
                    setOwner('');
                    setDue('');
                    router.refresh();
                  }
                })
              }
            >
              Add
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 py-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing to do yet.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.owner_name ?? 'Unassigned'}
                    {item.due_date ? ` · due ${item.due_date}` : ''}
                  </p>
                </div>
                <select
                  value={item.status}
                  onChange={(e) =>
                    startTransition(async () => {
                      const r = await updateActionItemStatusAction(
                        meeting.id,
                        item.id,
                        e.target.value as MeetingActionItem['status'],
                      );
                      if (!r.success) toast.error(r.error);
                      else router.refresh();
                    })
                  }
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReportTab({ report }: { report: MeetingReport | null }) {
  if (!report) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          The report could not be built.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Attendance and engagement</CardTitle>
        <p className="text-xs text-muted-foreground">
          {report.totals.joined} of {report.totals.invited} joined ·{' '}
          {report.totals.internal_joined} colleagues, {report.totals.external_joined}{' '}
          guests
          {report.totals.engagement_rate !== null &&
            ` · ${report.totals.engagement_rate}% met every measure`}
        </p>
      </CardHeader>
      <CardContent>
        {/* Wide table scrolls inside its own container so the page body never
            scrolls horizontally. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Joined</th>
                <th className="py-2 pr-3 font-medium">Polls</th>
                <th className="py-2 pr-3 font-medium">Quiz</th>
                <th className="py-2 pr-3 font-medium">Last seen</th>
                <th className="py-2 font-medium">Engaged</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.participant_id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    {r.display_name}
                    {r.organization && (
                      <span className="text-muted-foreground"> · {r.organization}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant={r.kind === 'external' ? 'outline' : 'secondary'}>
                      {r.kind === 'external' ? 'Guest' : 'Colleague'}
                    </Badge>
                    {/* An open-link attendee self-declared who they are.
                        Labelled so a compliance reader is not misled. */}
                    {r.invited_via === 'open_link' && (
                      <Badge variant="outline" className="ml-1 text-amber-700">
                        self-declared
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.joined_at
                      ? new Date(r.joined_at).toLocaleTimeString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : <span className="text-muted-foreground">Did not join</span>}
                  </td>
                  <td className="py-2 pr-3">{r.polls_answered}</td>
                  <td className="py-2 pr-3">
                    {r.quiz_score === null ? '—' : `${r.quiz_score}%`}
                  </td>
                  <td className="py-2 pr-3">{r.stayed_until ?? '—'}</td>
                  <td className="py-2">
                    {r.joined_at === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : r.gates.counted_total === 0 ? (
                      <span className="text-muted-foreground">Presence only</span>
                    ) : r.gates.is_engaged ? (
                      <Badge className="bg-green-600 hover:bg-green-600">Yes</Badge>
                    ) : (
                      <Badge variant="outline">
                        {r.gates.passed_count} of {r.gates.counted_total}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
