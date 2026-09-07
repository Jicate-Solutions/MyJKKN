'use client';

// My Induction — the fresher's own induction view (spec §5, Phase 3).
// A learner sees ONLY their batch's day-by-day schedule (fn_induction_list_sessions
// is already student-batch-filtered), rates each session 1–5 + comment
// (fn_induction_submit_feedback), and gets a "finish your profile" nudge toward
// the Day-10 deadline. Lives in the student /learners/my-* namespace (auto
// student-visible via isStudentPortalRoute). Read-only schedule; the ONLY write
// is the per-session rating.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SessionsLedCard } from './_components/sessions-led-card';
import { SeniorPeerMentorCard } from './_components/senior-peer-mentor-card';
import { InductionPulseBanner } from './_components/induction-pulse-banner';
import { SessionPollBanner } from './_components/session-poll-banner';
import { SessionQuestionBanner } from './_components/session-question-banner';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import {
  Rocket, CalendarDays, MapPin, User, Award, ExternalLink, Building2, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  InductionService,
  type MyInductionEnrollment,
  type InductionSessionRow,
  type MyInductionReferral,
} from '@/lib/services/induction/induction-service';
import { SessionRatingCard } from './_components/session-rating-card';
import { ProfileNudge } from './_components/profile-nudge';
import { ReferralSection } from './_components/referral-section';
import { AdvocacyCard } from './_components/advocacy-card';
import { DayFeedbackCard } from './_components/day-feedback-card';
import { ProgramFeedbackCard } from './_components/program-feedback-card';
import { MentorMonthFeedbackCard } from './_components/mentor-month-feedback-card';

const BRAND = '#0b6d41';

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyInductionPage() {
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<MyInductionEnrollment | null>(null);
  const [sessions, setSessions] = useState<InductionSessionRow[]>([]);
  const [feedback, setFeedback] = useState<Record<string, { rating: number; comment: string | null }>>({});
  const [referrals, setReferrals] = useState<MyInductionReferral[]>([]);
  const [dayFeedback, setDayFeedback] = useState<Record<number, { rating: number; comment: string | null }>>({});
  const [programFeedback, setProgramFeedback] = useState<{ rating: number; comment: string | null } | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await InductionService.myEnrollments();
      const mine = rows[0] ?? null; // most recent (RPC orders by start_date DESC)
      setEnrollment(mine);
      if (mine) {
        setLoadingSessions(true);
        const [sess, fb, refs, dayFb, progFb] = await Promise.all([
          InductionService.listSessions(mine.event_id),
          InductionService.myFeedback(mine.event_id),
          InductionService.myReferrals(mine.event_id),
          mine.feedback_day_enabled ? InductionService.myDayFeedback(mine.event_id) : Promise.resolve([]),
          mine.feedback_program_enabled ? InductionService.myProgramFeedback(mine.event_id) : Promise.resolve(null),
        ]);
        setSessions(sess);
        const map: Record<string, { rating: number; comment: string | null }> = {};
        for (const f of fb) map[f.session_id] = { rating: f.rating, comment: f.comment };
        setFeedback(map);
        setReferrals(refs);
        const dmap: Record<number, { rating: number; comment: string | null }> = {};
        for (const d of dayFb) dmap[d.day_number] = { rating: d.rating, comment: d.comment };
        setDayFeedback(dmap);
        setProgramFeedback(progFb ? { rating: progFb.rating, comment: progFb.comment } : null);
        setLoadingSessions(false);
      }
    } catch (e: any) {
      toast.error(`Couldn't load your induction: ${e?.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const byDay = new Map<number, InductionSessionRow[]>();
    for (const s of sessions) {
      const d = s.day_number ?? 0;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(s);
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  }, [sessions]);

  if (loading) {
    return (
      <ContentLayout title="My Induction">
        <div className="flex justify-center py-20"><BeatLoader color={BRAND} /></div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Induction">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Learners', href: '/learners' }, { label: 'My Induction' }]} />

      <div className="space-y-6 mt-4 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <Rocket className="h-6 w-6" style={{ color: BRAND }} /> My Induction
          </h1>
          <p className="text-sm text-muted-foreground">
            Your batch&apos;s day-by-day schedule. Rate each session so we can make induction better.
          </p>
        </div>

        {/* Presenter credit — shows only if you led any session */}
        <SessionsLedCard />

        {/* Senior Peer Mentor entry — shows only if you're an appointed mentor */}
        <SeniorPeerMentorCard />

        {!enrollment ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Rocket className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">You&apos;re not enrolled in an induction program right now.</p>
              <p className="text-sm mt-1">When your college starts your induction, it will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Live pulse — a resource person is collecting feedback right now */}
            <InductionPulseBanner />
            {/* Session poll — answer open opinion polls for this induction */}
            <SessionPollBanner />
            {/* Question board — ask the host a question and upvote other learners' */}
            <SessionQuestionBanner />

            {/* Header — induction + my completion */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">{enrollment.event_name}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {enrollment.institution_name}</span>
                  {(enrollment.start_date || enrollment.end_date) && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmtDate(enrollment.start_date)}{enrollment.end_date ? ` – ${fmtDate(enrollment.end_date)}` : ''}
                    </span>
                  )}
                  {enrollment.batch_label && (
                    <Badge variant="secondary">Batch {enrollment.batch_label}</Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Sessions attended</div>
                  <div className="font-semibold text-lg">
                    {enrollment.sessions_attended}/{enrollment.sessions_total}
                    <span className="text-muted-foreground text-sm font-normal"> ({Math.round(enrollment.attendance_pct)}%)</span>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Participation</div>
                  <div className="font-semibold text-lg">
                    {enrollment.participation_complete
                      ? <span className="flex items-center gap-1" style={{ color: BRAND }}><CheckCircle2 className="h-4 w-4" /> Complete</span>
                      : <span className="text-muted-foreground">In progress</span>}
                  </div>
                </div>
                {enrollment.value_score_avg != null && (
                  <div>
                    <div className="text-muted-foreground text-xs">Your avg rating</div>
                    <div className="font-semibold text-lg flex items-center gap-1">
                      <Award className="h-4 w-4" style={{ color: BRAND }} /> {Number(enrollment.value_score_avg).toFixed(1)}/5
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly "did your mentor help you?" rating — self-scoping, only shows once a check-in has come due */}
            <MentorMonthFeedbackCard eventId={enrollment.event_id} />

            {/* Profile nudge — the Day-10 onboarding driver */}
            <ProfileNudge
              isComplete={enrollment.is_profile_complete}
              filled={enrollment.profile_fields_filled}
              total={enrollment.profile_fields_total}
              deadline={enrollment.end_date}
            />

            {/* Schedule */}
            {loadingSessions ? (
              <div className="flex justify-center py-10"><BeatLoader color={BRAND} size={10} /></div>
            ) : sessions.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                  Your schedule isn&apos;t published yet. Check back soon.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {days.map(([day, daySessions]) => (
                  <div key={day} className="space-y-3">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {day > 0 ? `Day ${day}` : 'Schedule'}
                    </h2>
                    {daySessions.map((s) => (
                      <Card key={s.id} id={`isession-${s.id}`} className="transition-shadow">
                        <CardContent className="pt-5 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold">{s.title}</div>
                              {s.description && <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>}
                            </div>
                            {(s.start_at || s.end_at) && (
                              <Badge variant="outline" className="shrink-0">
                                {fmtTime(s.start_at)}{s.end_at ? `–${fmtTime(s.end_at)}` : ''}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {s.speaker_text && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {s.speaker_text}</span>}
                            {s.venue_text && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {s.venue_text}</span>}
                          </div>

                          {s.outcome_text && (
                            <p className="text-sm rounded-md bg-muted/40 px-3 py-2">
                              <span className="font-medium">Outcome: </span>{s.outcome_text}
                            </p>
                          )}

                          {Array.isArray(s.resource_links) && s.resource_links.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {s.resource_links.map((r, i) => (
                                <Button key={i} asChild size="sm" variant="outline" className="h-7">
                                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-1 h-3 w-3" /> {r.label || 'Resource'}
                                  </a>
                                </Button>
                              ))}
                            </div>
                          )}

                          <SessionRatingCard
                            sessionId={s.id}
                            initialRating={feedback[s.id]?.rating ?? null}
                            initialComment={feedback[s.id]?.comment ?? null}
                            onSubmitted={(rating, comment) =>
                              setFeedback((prev) => ({ ...prev, [s.id]: { rating, comment } }))
                            }
                          />
                        </CardContent>
                      </Card>
                    ))}
                    {enrollment.feedback_day_enabled && day > 0 && (
                      <DayFeedbackCard
                        eventId={enrollment.event_id}
                        dayNumber={day}
                        initialRating={dayFeedback[day]?.rating ?? null}
                        initialComment={dayFeedback[day]?.comment ?? null}
                        onSubmitted={(rating, comment) =>
                          setDayFeedback((prev) => ({ ...prev, [day]: { rating, comment } }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Phase 4 — the value→advocacy→refer→join funnel (after experiencing value) */}
            <div className="space-y-4 pt-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Grow JKKN
              </h2>
              {enrollment.feedback_program_enabled && (
                <ProgramFeedbackCard
                  eventId={enrollment.event_id}
                  initialRating={programFeedback?.rating ?? null}
                  initialComment={programFeedback?.comment ?? null}
                />
              )}
              <AdvocacyCard eventId={enrollment.event_id} initialScore={enrollment.advocacy_score} />
              <ReferralSection eventId={enrollment.event_id} initialReferrals={referrals} />
            </div>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
