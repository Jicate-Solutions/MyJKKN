'use client';

// Senior Peer Mentor (PR2) — a senior student's peer-mentor lane.
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
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { Users, Building2, CalendarClock, MessagesSquare, Lock, ClipboardList } from 'lucide-react';
// The coordinator console's roster dialog, driven here by the mentor-scoped RPCs.
import { AttendanceDialog } from '@/app/(routes)/events/induction/[id]/_components/attendance-dialog';
import {
  InductionVolunteerService,
  type MyVolunteerSession,
  type MyTrainingStatus,
} from '@/lib/services/induction/induction-volunteer-service';
import { GroupCaptureDialog } from './_components/group-capture-dialog';
import { AttendanceCheckinDialog } from './_components/attendance-checkin-dialog';
import { TrainingGatePanel } from './_components/training-gate-panel';

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
  const [training, setTraining] = useState<Record<string, MyTrainingStatus>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, tr] = await Promise.all([
        InductionVolunteerService.myVolunteerSessions(),
        InductionVolunteerService.myTrainingStatus(),
      ]);
      setSessions(rows);
      setTraining(Object.fromEntries(tr.map((t) => [t.event_id, t])));
    } catch (e: any) {
      toast.error(`Couldn't load your sessions: ${e?.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Group sessions by event.
  //
  // The EVENT is kept whenever the RPC returned anything for it, but only the
  // sessions a mentor can actually work are listed under it: ones where they own
  // freshers (group_size > 0), plus the registration desk, which is cohort-wide
  // and always reports group_size 0.
  //
  // Dropping the event too — which is what this did — is what made an appointed
  // mentor read "You're not a Senior Peer Mentor right now." Before a coordinator
  // splits the cohort into groups, EVERY session comes back with group_size 0, so
  // a freshly appointed mentor was told they had not been appointed. "No group
  // assigned yet" and "not a mentor" are different states and now render
  // differently.
  const events = useMemo(() => {
    const byEvent = new Map<string, { name: string; institution: string | null; sessions: MyVolunteerSession[] }>();
    for (const s of sessions) {
      if (!byEvent.has(s.event_id)) {
        byEvent.set(s.event_id, { name: s.event_name, institution: s.institution_name, sessions: [] });
      }
      if (s.kind === 'registration' || s.group_size > 0) {
        byEvent.get(s.event_id)!.sessions.push(s);
      }
    }
    return [...byEvent.entries()];
  }, [sessions]);

  // fn_induction_my_training_status returns one row per ACTIVE appointment, with
  // no dependency on sessions, groups or event status — so it is the honest
  // answer to "am I a mentor at all", and it still answers for an event that has
  // no sessions yet or is not live.
  const appointedEventIds = useMemo(() => Object.keys(training), [training]);
  const isMentor = events.length > 0 || appointedEventIds.length > 0;
  // Appointed on events the sessions RPC said nothing about (not live yet, or no
  // sessions scheduled). No name to show for these, but the mentor still needs
  // the training gate — training is what unlocks capture on day one.
  const eventlessAppointments = appointedEventIds.filter(
    (id) => !events.some(([eventId]) => eventId === id),
  );

  if (loading) {
    return (
      <ContentLayout title="Senior Peer Mentor">
        <div className="flex justify-center py-20"><BeatLoader color={BRAND} /></div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Senior Peer Mentor">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Senior Peer Mentor' }]} />

      <div className="space-y-6 mt-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <MessagesSquare className="h-6 w-6" style={{ color: BRAND }} /> Senior Peer Mentor
          </h1>
          <p className="text-sm text-muted-foreground">
            As a Senior Peer Mentor, mark your group&apos;s attendance and collect each assigned
            fresher&apos;s session feedback — especially those without a phone of their own.
          </p>
        </div>

        {!isMentor ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">You&apos;re not a Senior Peer Mentor right now.</p>
              <p className="text-sm mt-1">
                When a coordinator appoints you, your induction and its sessions will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
          {eventlessAppointments.map((eventId) => (
            <Card key={eventId}>
              <CardHeader>
                <CardTitle className="text-lg">You&apos;re a Senior Peer Mentor</CardTitle>
                <CardDescription>
                  Your induction hasn&apos;t opened its sessions yet. They&apos;ll appear here once it goes live.
                </CardDescription>
              </CardHeader>
              {training[eventId] && !training[eventId].is_trained && (
                <CardContent>
                  <TrainingGatePanel status={training[eventId]} onChanged={load} />
                </CardContent>
              )}
            </Card>
          ))}
          {events.map(([eventId, ev]) => {
            const trStatus = training[eventId];
            const trained = trStatus?.is_trained ?? false;
            return (
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
                {trStatus && !trStatus.is_trained && (
                  <TrainingGatePanel status={trStatus} onChanged={load} />
                )}
                {/* Appointed, but the cohort has not been split into groups yet —
                    say exactly that. This is the state that used to render as
                    "You're not a Senior Peer Mentor right now." */}
                {ev.sessions.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      You&apos;re appointed — your group hasn&apos;t been assigned yet.
                    </p>
                    <p className="mt-1">
                      Your coordinator still has to split the freshers into groups. As soon as yours
                      exists, every session you cover will appear here.
                      {trStatus && !trStatus.is_trained
                        ? ' Finish your training above in the meantime so you’re ready on day one.'
                        : ''}
                    </p>
                  </div>
                )}
                {ev.sessions.map((s) => {
                  const done = s.group_size > 0 && s.captured >= s.group_size;
                  const isRegistration = s.kind === 'registration';
                  return (
                    <div key={s.session_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {s.session_title}
                          {isRegistration && (
                            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                              <ClipboardList className="h-3 w-3" /> Registration
                            </Badge>
                          )}
                        </div>
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
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {/* The registration desk is cohort-wide, so a per-group
                            capture count would be meaningless (and always 0/0). */}
                        {!isRegistration && (
                          <Badge variant={done ? 'default' : 'secondary'} className="tabular-nums">
                            {s.captured}/{s.group_size} captured
                          </Badge>
                        )}
                        {isRegistration ? (
                          /* Same roster screen the coordinator uses — search by
                             name / register number / parent mobile, P/A/E/OD —
                             but through the mentor-scoped RPC pair. Open to an
                             untrained mentor by design: registration runs on day
                             1, before training is recorded. */
                          <AttendanceDialog
                            sessionId={s.session_id}
                            sessionTitle={s.session_title}
                            api={{
                              loadRoster: InductionVolunteerService.registrationRoster,
                              save: InductionVolunteerService.markAttendance,
                            }}
                            trigger={
                              <Button size="sm" variant="outline">
                                <ClipboardList className="h-3.5 w-3.5 mr-1" /> Register freshers
                              </Button>
                            }
                          />
                        ) : trained ? (
                          <>
                            <AttendanceCheckinDialog sessionId={s.session_id} sessionTitle={s.session_title} onSaved={load} />
                            <GroupCaptureDialog sessionId={s.session_id} sessionTitle={s.session_title} onSaved={load} />
                          </>
                        ) : (
                          <Button size="sm" variant="outline" disabled title="Finish your training to unlock this">
                            <Lock className="h-3.5 w-3.5 mr-1" /> Locked
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            );
          })}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
