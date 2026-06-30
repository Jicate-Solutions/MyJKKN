'use client';

// My Induction Feedback (PR2) — a senior student's peer-mentor lane.
//
// UNGATED by design (no RoutePermissionGuard, no MENU_PERMISSIONS entry), mirroring
// /my-induction-sessions: the RPC fn_induction_my_volunteer_sessions self-scopes to
// the events where the caller is an ACTIVE appointed feedback volunteer, so a
// non-mentor simply sees the empty state — nothing to leak.
//
// The mentor sees each session they cover (with their capture progress) and opens a
// dialog to record each assigned fresher's own 1–5 rating on the mentor's phone.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { Users, Building2, CalendarClock, MessagesSquare } from 'lucide-react';
import {
  InductionVolunteerService,
  type MyVolunteerSession,
} from '@/lib/services/induction/induction-volunteer-service';
import { GroupCaptureDialog } from './_components/group-capture-dialog';

const BRAND = '#0b6d41';

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function MyInductionFeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<MyVolunteerSession[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await InductionVolunteerService.myVolunteerSessions();
      setSessions(rows);
    } catch (e: any) {
      toast.error(`Couldn't load your sessions: ${e?.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Group sessions by event; only sessions where I actually own freshers (group_size > 0).
  const events = useMemo(() => {
    const byEvent = new Map<string, { name: string; institution: string | null; sessions: MyVolunteerSession[] }>();
    for (const s of sessions) {
      if (s.group_size <= 0) continue;
      if (!byEvent.has(s.event_id)) {
        byEvent.set(s.event_id, { name: s.event_name, institution: s.institution_name, sessions: [] });
      }
      byEvent.get(s.event_id)!.sessions.push(s);
    }
    return [...byEvent.entries()];
  }, [sessions]);

  if (loading) {
    return (
      <ContentLayout title="My Induction Feedback">
        <div className="flex justify-center py-20"><BeatLoader color={BRAND} /></div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Induction Feedback">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Induction Feedback' }]} />

      <div className="space-y-6 mt-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <MessagesSquare className="h-6 w-6" style={{ color: BRAND }} /> My Induction Feedback
          </h1>
          <p className="text-sm text-muted-foreground">
            As a peer mentor, collect each assigned fresher&apos;s session rating on your phone —
            especially those without a phone of their own.
          </p>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">You&apos;re not a feedback peer mentor right now.</p>
              <p className="text-sm mt-1">
                When a coordinator assigns you a group of freshers, their sessions will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          events.map(([eventId, ev]) => (
            <Card key={eventId}>
              <CardHeader>
                <CardTitle className="text-lg">{ev.name}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                  {ev.institution && (
                    <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {ev.institution}</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ev.sessions.map((s) => {
                  const done = s.group_size > 0 && s.captured >= s.group_size;
                  return (
                    <div key={s.session_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{s.session_title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {s.day_number ? <span>Day {s.day_number}</span> : null}
                          {(s.start_at || s.end_at) && (
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              {fmtTime(s.start_at)}{s.end_at ? `–${fmtTime(s.end_at)}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={done ? 'default' : 'secondary'} className="tabular-nums">
                          {s.captured}/{s.group_size} captured
                        </Badge>
                        <GroupCaptureDialog sessionId={s.session_id} sessionTitle={s.session_title} onSaved={load} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ContentLayout>
  );
}
