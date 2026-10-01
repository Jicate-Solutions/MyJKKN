// ============================================================================
// HR — Performance Review Cycle Detail (T5.1, Director admin surface)
// ============================================================================
// Shows a single cycle plus the per-staff progress board scoped to it.
// Director can transition status (draft → open → locked → closed). SEDC sees
// the same board for final-approval triage.
//
// Status progress counters: how many reviews in each state for this cycle.
// Spec: specs/hr-module-decomposition-2026-05-09.md (T5.1)
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { AppraisalHrGate } from '@/features/hr/appraisal/appraisal-hr-gate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ReviewDecisionPanel } from '@/features/hr/appraisal/review-decision-panel';
import { LockRoundControl } from '@/features/hr/appraisal/lock-round-control';
import { InstrumentCheckPanel } from '@/features/hr/appraisal/instrument-check-panel';
import { SecondRaterCell } from '@/features/hr/appraisal/second-rater-cell';
import {
  AppraisalSecondRatingService,
  type HRSecondRating,
} from '@/lib/services/hr/appraisal-second-rating-service';
import { parseRatings, resolveAreas, summariseRatings } from '@/lib/hr/appraisal-ratings';
import { personName, type TeamPerson } from '@/lib/hr/appraisal-team-board';
import {
  PerformanceReviewService,
  type CycleStatus,
  type HRPerformanceReview,
  type HRPerformanceReviewCycle,
  type HRPerformanceReviewPolicy,
  type ReviewStatus,
} from '@/lib/services/hr/performance-review-service';

// Pretty labels for each review state.
const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Draft',
  self_submitted: 'Self-submitted',
  supervisor_reviewed: 'Supervisor reviewed',
  sedc_reviewed: 'SEDC reviewed',
  final_approved: 'Final approved',
};

// Allowed forward transitions for the CYCLE status (mirrors SQL CHECK).
const NEXT_CYCLE_STATUS: Record<CycleStatus, CycleStatus | null> = {
  draft: 'open',
  open: 'locked',
  locked: 'closed',
  closed: null,
};

function cycleStatusLabel(s: CycleStatus): string {
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'open':
      return 'Open for self-appraisal';
    case 'locked':
      return 'Locked — SEDC review';
    case 'closed':
      return 'Closed';
  }
}

export default function HrPerformanceReviewCycleDetailPage() {
  const params = useParams<{ id: string }>();
  const cycleId = params?.id;
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [cycle, setCycle] = useState<HRPerformanceReviewCycle | null>(null);
  const [reviews, setReviews] = useState<HRPerformanceReview[]>([]);
  // Names for the people in the table, so the admin sees who each row is
  // instead of an 8-character id. listPeople never throws.
  const [people, setPeople] = useState<Record<string, TeamPerson>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const [policy, setPolicy] = useState<HRPerformanceReviewPolicy | null>(null);
  const [selected, setSelected] = useState<HRPerformanceReview | null>(null);
  const [approverProfileId, setApproverProfileId] = useState<string | null>(null);
  // Director ruling, 1 Oct 2026: only the Director list sees Sign off. Other
  // super admins can still open a signed-off appraisal. Fails closed: until
  // the database answers, or if it cannot, the button stays hidden.
  const [isTheDirector, setIsTheDirector] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.rpc('fn_is_the_director').then(({ data, error }) => {
      if (alive) setIsTheDirector(!error && data === true);
    });
    return () => { alive = false; };
  }, [supabase]);

  // Blind second ratings on this round's appraisals, and the names of the
  // people asked. They feed only the agreement report below.
  const [secondRatings, setSecondRatings] = useState<HRSecondRating[]>([]);
  const [raterNames, setRaterNames] = useState<Record<string, string>>({});
  const [secondError, setSecondError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await AppraisalSecondRatingService.listForReviews(
          supabase,
          reviews.map((r) => r.id),
        );
        const ids = Array.from(new Set(rows.map((r) => r.rater_id)));
        const names: Record<string, string> = {};
        if (ids.length > 0) {
          const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
            if (p.full_name) names[p.id] = p.full_name;
          }
        }
        if (cancelled) return;
        setSecondRatings(rows);
        setRaterNames(names);
        setSecondError(null);
      } catch (e) {
        if (!cancelled) {
          setSecondError(e instanceof Error ? e.message : 'Second ratings could not be loaded.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviews, supabase]);

  // Thresholds for the checks on the appraisal itself (agreement floor,
  // spread warning), read for this round's college. A group-wide round has
  // no college, so it reads the group value.
  const [roundPolicy, setRoundPolicy] = useState<HRPerformanceReviewPolicy | null>(null);
  const roundCollege = cycle?.institution_id ?? null;
  useEffect(() => {
    let cancelled = false;
    PerformanceReviewService.getPolicy(supabase, roundCollege)
      .then((pol) => {
        if (!cancelled) setRoundPolicy(pol);
      })
      .catch(() => {
        // Left null: the checks fall back to their documented defaults.
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, roundCollege]);

  // The signed-in profile, stamped on approval. Needed only by the panel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await supabase.auth.getUser();
        if (cancelled) return;
        setApproverProfileId(auth.data.user?.id ?? null);
      } catch {
        // Not fatal for the read-only list; the panel reports its own
        // failure when a sign-off is actually attempted.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // The rating rule for the OPEN appraisal, read for that person's own
  // college. A group-wide round spans several colleges, and each may have
  // switched the Collegiality example off, so one policy for the whole page
  // would apply the wrong college's setting.
  const selectedStaffId = selected?.staff_id ?? null;
  useEffect(() => {
    setPolicy(null);
    if (!selectedStaffId) return;
    let cancelled = false;
    PerformanceReviewService.getPolicyForStaff(supabase, selectedStaffId)
      .then((pol) => {
        if (!cancelled) setPolicy(pol);
      })
      .catch(() => {
        // Left null: the example stays required, the stricter default.
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedStaffId]);

  // Group reviews by status for the progress counters.
  const counters = useMemo(() => {
    const c: Record<ReviewStatus, number> = {
      draft: 0,
      self_submitted: 0,
      supervisor_reviewed: 0,
      sedc_reviewed: 0,
      final_approved: 0,
    };
    for (const r of reviews) c[r.status] += 1;
    return c;
  }, [reviews]);

  useEffect(() => {
    if (!cycleId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [c, rs] = await Promise.all([
          PerformanceReviewService.getCycle(supabase, cycleId!),
          PerformanceReviewService.listReviews(supabase, cycleId!),
        ]);
        if (cancelled) return;
        setCycle(c);
        setReviews(rs);
        const ppl = await PerformanceReviewService.listPeople(supabase, rs.map((r) => r.staff_id));
        if (cancelled) return;
        setPeople(ppl);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load cycle.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cycleId, supabase]);

  async function refresh() {
    if (!cycleId) return;
    setLoading(true);
    try {
      const [c, rs] = await Promise.all([
        PerformanceReviewService.getCycle(supabase, cycleId),
        PerformanceReviewService.listReviews(supabase, cycleId),
      ]);
      setCycle(c);
      setReviews(rs);
      setPeople(await PerformanceReviewService.listPeople(supabase, rs.map((r) => r.staff_id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setLoading(false);
    }
  }

  async function transitionStatus(target: CycleStatus) {
    if (!cycle) return;
    setTransitioning(true);
    try {
      const updated = await PerformanceReviewService.updateCycle(supabase, cycle.id, {
        status: target,
      });
      setCycle(updated);
      toast.success(`Cycle ${updated.cycle_year} → ${cycleStatusLabel(target)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transition failed.');
    } finally {
      setTransitioning(false);
    }
  }

  if (!cycleId) {
    return (
      <ContentLayout title="Cycle not found">
        <p>Cycle id missing in URL.</p>
      </ContentLayout>
    );
  }

  // Opens for a super admin or the appraisal-manage key (HR). Moving the
  // round on, the committee review and the Director's sign-off stay
  // super-admin only, wrapped below, exactly as in #4081.
  return (
    <AppraisalHrGate>
    <ContentLayout title={cycle ? `Cycle ${cycle.cycle_year}` : 'Loading cycle…'}>
      <div className="space-y-4">
        <div>
          <Link
            href="/hr/admin/performance-reviews/cycles"
            className="inline-flex items-center text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to all cycles
          </Link>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {cycle && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                Cycle {cycle.cycle_year}
                <span className="ml-3 text-sm font-normal text-muted-foreground">
                  {cycle.start_date} → {cycle.end_date}
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{cycleStatusLabel(cycle.status)}</Badge>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                  <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cycle.description && (
                <p className="text-sm text-muted-foreground">{cycle.description}</p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(Object.entries(counters) as [ReviewStatus, number][]).map(
                  ([state, count]) => (
                    <div
                      key={state}
                      className="rounded-md border bg-muted/20 p-3 text-center"
                    >
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground">
                        {REVIEW_STATUS_LABEL[state]}
                      </div>
                    </div>
                  ),
                )}
              </div>

              {/* Status transition controls */}
              <SuperAdminOnly>
              {NEXT_CYCLE_STATUS[cycle.status] && (
                <div className="flex items-start gap-2 pt-2 border-t">
                  <span className="pt-1 text-sm text-muted-foreground">Next step:</span>
                  {cycle.status === 'open' ? (
                    // Locking can strand appraisals, so it has its own control:
                    // refused while any wait for their head, and confirmed on
                    // the page when drafts would be left out (round-5 review).
                    <LockRoundControl
                      pending={counters.self_submitted}
                      drafts={counters.draft}
                      busy={transitioning}
                      onLock={() => transitionStatus('locked')}
                    />
                  ) : (
                    <Button
                      size="sm"
                      disabled={transitioning}
                      onClick={() => transitionStatus(NEXT_CYCLE_STATUS[cycle.status]!)}
                    >
                      Move to {cycleStatusLabel(NEXT_CYCLE_STATUS[cycle.status]!)}
                    </Button>
                  )}
                </div>
              )}
              </SuperAdminOnly>
            </CardContent>
          </Card>
        )}

        <SuperAdminOnly>
        {selected && (
          <ReviewDecisionPanel
            supabase={supabase}
            review={selected}
            policy={policy}
            approverProfileId={approverProfileId}
            onClose={() => setSelected(null)}
            onDone={(updated) => {
              setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
              setSelected(null);
            }}
          />
        )}
        </SuperAdminOnly>

        {secondError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Second ratings could not be loaded</AlertTitle>
            <AlertDescription>{secondError}</AlertDescription>
          </Alert>
        ) : (
          <InstrumentCheckPanel reviews={reviews} secondRatings={secondRatings} policy={roundPolicy} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff progress</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : reviews.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No staff rows yet. They appear after the first self-appraisal save.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Team member</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Self-submitted</th>
                      <th className="py-2 pr-4">Supervisor</th>
                      <th className="py-2 pr-4">SEDC</th>
                      <th className="py-2 pr-4">Ratings</th>
                      <th className="py-2 pr-4">Final score</th>
                      <th className="py-2 pr-4">Blind second rating</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{personName(people, r.staff_id)}</div>
                          {people[r.staff_id]?.department && (
                            <div className="text-xs text-muted-foreground">
                              {people[r.staff_id]?.department}
                            </div>
                          )}
                          {!people[r.staff_id]?.name && (
                            // Two unnamed rows would otherwise look identical.
                            <div className="text-xs text-muted-foreground">
                              ref {r.staff_id.slice(0, 8)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4">{REVIEW_STATUS_LABEL[r.status]}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.self_submitted_at ? new Date(r.self_submitted_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.supervisor_reviewed_at ? new Date(r.supervisor_reviewed_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.sedc_reviewed_at ? new Date(r.sedc_reviewed_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {summariseRatings(
                            parseRatings(
                              r.sedc_review_jsonb ??
                                r.supervisor_review_jsonb ??
                                r.self_appraisal_jsonb,
                              resolveAreas(),
                            ),
                            resolveAreas(),
                          )}
                        </td>
                        <td className="py-2 pr-4 font-medium">
                          {r.final_score !== null ? r.final_score.toFixed(2) : '—'}
                        </td>
                        <td className="py-2 pr-4 align-top">
                          <SecondRaterCell
                            supabase={supabase}
                            review={r}
                            secondRating={secondRatings.find((s) => s.review_id === r.id)}
                            raterName={(() => {
                              const s = secondRatings.find((x) => x.review_id === r.id);
                              return s ? raterNames[s.rater_id] : undefined;
                            })()}
                            onChanged={(next, name) => {
                              setSecondRatings((all) => [
                                ...all.filter((x) => x.review_id !== r.id),
                                ...(next ? [next] : []),
                              ]);
                              if (next && name) {
                                setRaterNames((m) => ({ ...m, [next.rater_id]: name }));
                              }
                            }}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <SuperAdminOnly>
                          {(r.status === 'supervisor_reviewed' ||
                            (r.status === 'sedc_reviewed' && isTheDirector) ||
                            r.status === 'final_approved') && (
                            <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
                              {r.status === 'sedc_reviewed' ? 'Sign off' : r.status === 'final_approved' ? 'View sign-off' : 'Committee review'}
                            </Button>
                          )}
                          {r.status === 'sedc_reviewed' && !isTheDirector && (
                            <span className="text-xs text-muted-foreground">Waiting for the Director</span>
                          )}
                          </SuperAdminOnly>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </AppraisalHrGate>
  );
}
