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
import {
  Mic, CalendarDays, MapPin, Star, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';

type CommentState = 'loading' | SessionCommentRow[] | { error: string };

export function SessionsLedCard({ showEmptyState = false }: { showEmptyState?: boolean }) {
  const [rows, setRows] = useState<MySessionFeedbackRow[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, CommentState>>({});
  const [tips, setTips] = useState<Record<string, SessionLoopTip>>({});

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

  // nothing led
  if (rows.length === 0) {
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
          <Mic className="h-4 w-4 text-emerald-600" />
          <CardTitle className="text-base">Sessions you led</CardTitle>
        </div>
        <CardDescription>
          Induction sessions you presented as a resource person, with each session&apos;s
          anonymous feedback. Ratings stay hidden until at least 3 freshers respond.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
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

              {/* resource-person live pulse control (open / live totals / close) */}
              <div className="mt-2">
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
