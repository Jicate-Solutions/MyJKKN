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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  PerformanceReviewService,
  type CycleStatus,
  type HRPerformanceReview,
  type HRPerformanceReviewCycle,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

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

  return (
    <SuperAdminOnly>
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
              {NEXT_CYCLE_STATUS[cycle.status] && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Next step:</span>
                  <Button
                    size="sm"
                    disabled={transitioning}
                    onClick={() => transitionStatus(NEXT_CYCLE_STATUS[cycle.status]!)}
                  >
                    Move to {cycleStatusLabel(NEXT_CYCLE_STATUS[cycle.status]!)}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
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
                      <th className="py-2 pr-4">Staff (ID)</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Self-submitted</th>
                      <th className="py-2 pr-4">Supervisor</th>
                      <th className="py-2 pr-4">SEDC</th>
                      <th className="py-2 pr-4">Final score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-mono text-xs">{r.staff_id.slice(0, 8)}…</td>
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
                        <td className="py-2 pr-4 font-medium">
                          {r.final_score !== null ? r.final_score.toFixed(2) : '—'}
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
    </SuperAdminOnly>
  );
}
