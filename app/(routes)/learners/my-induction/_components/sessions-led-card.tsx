'use client';

// "Sessions you led" — credit + feedback surface for people who presented an
// induction session (senior students + staff). Self-scoped via
// fn_induction_my_sessions_feedback (defaults to the caller). Shows each led
// session's anonymous feedback (avg + count, k>=3 floor) and lazily expands its
// anonymized comments — the resource person's own lane on the value signal, with
// NO induction.view required.
//
// Empty behaviour is caller-controlled: on the fresher's /learners/my-induction
// page (default) it renders NOTHING when you led none, so it never clutters a
// fresher's view; on the dedicated "My Sessions" page (showEmptyState) it renders
// a friendly empty state instead.
import { useEffect, useState } from 'react';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  InductionSpeakersService,
  type MySessionFeedbackRow,
  type SessionCommentRow,
  type SessionLoopTip,
} from '@/lib/services/induction/induction-speakers-service';
import { SessionPulseControl } from './session-pulse-control';
import { SessionLoopTipCard } from './session-loop-tip';
// The coordinator console's roster dialog, reused verbatim so a resource person
// marks attendance through the SAME UI (search, P/A/E/OD, mark-all) the
// coordinator uses — it calls fn_induction_mark_attendance, whose speaker branch
// authorizes exactly the sessions listed on this card.
import { AttendanceDialog } from '@/app/(routes)/events/induction/[id]/_components/attendance-dialog';
import {
  InductionVolunteerService,
  type MyVolunteerSession,
} from '@/lib/services/induction/induction-volunteer-service';
import {
  Mic, CalendarDays, MapPin, Star, MessageSquare, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList,
} from 'lucide-react';

type CommentState = 'loading' | SessionCommentRow[] | { error: string };

export function SessionsLedCard({ showEmptyState = false }: { showEmptyState?: boolean }) {
  const [rows, setRows] = useState<MySessionFeedbackRow[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, CommentState>>({});
  const [tips, setTips] = useState<Record<string, SessionLoopTip>>({});
  // REGISTRATION DESKS I may staff. Sourced from the mentor RPC, which self-scopes
  // to events where I'm an ACTIVE Senior Peer Mentor — so for anyone else (staff
  // resource person, fresher, non-mentor) this is simply empty and the card is
  // unchanged. A desk needs no speaker credit, which is exactly why it can't ride
  // in on getMySessionsFeedback().
  const [desks, setDesks] = useState<MyVolunteerSession[]>([]);

  useEffect(() => {
    InductionVolunteerService.myVolunteerSessions()
      .then((all) => setDesks(all.filter((s) => s.kind === 'registration')))
      .catch(() => setDesks([]));
  }, []);

  useEffect(() => {
    InductionSpeakersService.getMySessionsFeedback()
      .then(async (sessions) => {
        setRows(sessions);
        // load the loop tips per distinct event, keyed by the weak session they apply to
        const eventIds = [...new Set(sessions.map((s) => s.event_id))];
        const map: Record<string, SessionLoopTip> = {};
        await Promise.all(
          eventIds.map((eid) =>
            InductionSpeakersService.getSessionLoopTips(eid)
              .then((ts) => {
                for (const t of ts) if (t.first_session_id) map[t.first_session_id] = t;
              })
              .catch(() => {})
          )
        );
        setTips(map);
      })
      .catch(() => setRows([]));
  }, []);

  async function toggleComments(sessionId: string) {
    const willOpen = !open[sessionId];
    setOpen((o) => ({ ...o, [sessionId]: willOpen }));
    // lazy-load once
    if (willOpen && comments[sessionId] === undefined) {
      setComments((c) => ({ ...c, [sessionId]: 'loading' }));
      try {
        const list = await InductionSpeakersService.getMySessionComments(sessionId);
        setComments((c) => ({ ...c, [sessionId]: list }));
      } catch (e: any) {
        setComments((c) => ({ ...c, [sessionId]: { error: e?.message ?? 'Could not load comments' } }));
      }
    }
  }

  // still loading
  if (rows === null) return null;

  // nothing led AND no desk to staff
  if (rows.length === 0 && desks.length === 0) {
    if (!showEmptyState) return null; // fresher page: stay invisible
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-emerald-600" />
            <CardTitle className="text-base">Your induction sessions</CardTitle>
          </div>
          <CardDescription>
            You aren&apos;t credited as a resource person on any induction session yet. Once a
            coordinator credits you, your sessions and their feedback appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {/* A mentor with only a desk never "led" anything — title follows the
              content so the card doesn't mislabel what's under it. */}
          {desks.length > 0 && rows.length === 0 ? (
            <>
              <ClipboardList className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-base">Your registration desk</CardTitle>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-base">Sessions you led</CardTitle>
            </>
          )}
        </div>
        <CardDescription>
          {desks.length > 0 && rows.length === 0 ? (
            <>The registration desk you staff as a Senior Peer Mentor. Open it to check in
            freshers as they arrive.</>
          ) : (
            <>Induction sessions you presented as a resource person, with each session&apos;s
            anonymous feedback. Ratings stay hidden until at least 3 freshers respond.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Registration desks — shown only to an active Senior Peer Mentor of the
            induction. Listed first: on day 1 the desk is the job. No feedback /
            comments / pulse block, because a desk isn't a talk to be rated. */}
        {desks.map((d) => (
          <div key={d.session_id} className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.03] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {d.session_title || 'Registration'}
                  <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                    <ClipboardList className="h-3 w-3" /> Registration desk
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {d.event_name && <span>{d.event_name}</span>}
                  {d.day_number ? <span>Day {d.day_number}</span> : null}
                  {d.start_at && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(d.start_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <AttendanceDialog
                sessionId={d.session_id}
                sessionTitle={d.session_title || 'Registration'}
                api={{
                  loadRoster: InductionVolunteerService.registrationRoster,
                  save: InductionVolunteerService.markAttendance,
                }}
                trigger={
                  <Button size="sm" className="shrink-0">
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Register freshers
                  </Button>
                }
              />
            </div>
          </div>
        ))}
        {rows.map((s) => {
          const isOpen = !!open[s.session_id];
          const cstate = comments[s.session_id];
          return (
            <div key={s.session_id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{s.title || 'Session'}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {s.event_name && <span>{s.event_name}</span>}
                    {s.start_at && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(s.start_at).toLocaleDateString()}
                      </span>
                    )}
                    {s.venue_text && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{s.venue_text}
                      </span>
                    )}
                  </div>
                </div>
                {/* rating badge */}
                <div className="shrink-0">
                  {s.response_count === 0 ? (
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                      No ratings yet
                    </Badge>
                  ) : s.suppressed ? (
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                      {s.response_count} response{s.response_count === 1 ? '' : 's'} · hidden
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {Number(s.avg_rating).toFixed(1)}
                      <span className="text-muted-foreground font-normal">
                        · {s.response_count}
                      </span>
                    </Badge>
                  )}
                </div>
              </div>

              {/* comments expander — only when ratings are visible (>=3 responses) */}
              {!s.suppressed && s.response_count >= 3 && (
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => toggleComments(s.session_id)}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {isOpen ? 'Hide comments' : 'View comments'}
                    {isOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                  </Button>
                  {isOpen && (
                    <div className="mt-2 space-y-2">
                      {cstate === 'loading' && (
                        <div className="text-xs text-muted-foreground">Loading comments…</div>
                      )}
                      {cstate && typeof cstate === 'object' && 'error' in cstate && (
                        <div className="text-xs text-destructive">{cstate.error}</div>
                      )}
                      {Array.isArray(cstate) && cstate.length === 0 && (
                        <div className="text-xs text-muted-foreground">No written comments.</div>
                      )}
                      {Array.isArray(cstate) &&
                        cstate.map((c, i) => (
                          <div key={i} className="rounded border bg-muted/30 p-2 text-xs">
                            <div className="flex items-center gap-1 text-amber-500">
                              {Array.from({ length: 5 }).map((_, j) => (
                                <Star
                                  key={j}
                                  className={`h-3 w-3 ${j < c.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                                />
                              ))}
                            </div>
                            {c.comment && <p className="mt-1 text-foreground/80">{c.comment}</p>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* resource-person session tools: attendance roster + live pulse */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AttendanceDialog
                  sessionId={s.session_id}
                  sessionTitle={s.title || 'Session'}
                  trigger={
                    <Button variant="outline" size="sm" className="h-8">
                      <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> Take attendance
                    </Button>
                  }
                />
                <SessionPulseControl sessionId={s.session_id} />
              </div>

              {/* session-effectiveness loop: AI tip + honest measured effect */}
              {tips[s.session_id] && (
                <div className="mt-2">
                  <SessionLoopTipCard tip={tips[s.session_id]} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
