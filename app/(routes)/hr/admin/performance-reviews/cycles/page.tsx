// ============================================================================
// HR — Performance Review Cycles (T5.1, Director admin surface)
// ============================================================================
// Lists hr_performance_review_cycles and lets the Director provision a new
// cycle. Cycle dates default to the policy window (period_start / period_end
// from hr.performance_review). Status transitions (draft → open → locked →
// closed) live on the cycle detail page.
//
// Permission: super_admin / admin only (cycles are Director-provisioned).
// Spec: specs/hr-module-decomposition-2026-05-09.md (T5.1)
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CalendarRange, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  PerformanceReviewService,
  type CycleStatus,
  type HRPerformanceReviewCycle,
  type HRPerformanceReviewPolicy,
} from '@/lib/services/hr/performance-review-service';

export const navMeta = {
  label: 'Performance Review Cycles',
  icon: 'CalendarRange',
} as const;

// Helper — render a status badge with sensible colors.
function StatusBadge({ status }: { status: CycleStatus }) {
  const map: Record<CycleStatus, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Draft', tone: 'outline' },
    open: { label: 'Open for self-appraisal', tone: 'default' },
    locked: { label: 'Locked — SEDC review', tone: 'secondary' },
    closed: { label: 'Closed', tone: 'destructive' },
  };
  const v = map[status];
  return <Badge variant={v.tone}>{v.label}</Badge>;
}

/**
 * Defaults a new cycle's dates from policy. Policy stores "MM-DD" strings;
 * we resolve them against the user's current year (period_end year wins).
 */
function defaultsFromPolicy(policy: HRPerformanceReviewPolicy | null) {
  const today = new Date();
  const cycleYear = today.getFullYear() + 1; // ending year for the typical Jul→Jun cycle
  const periodStart = policy?.period_start ?? '07-01';
  const periodEnd = policy?.period_end ?? '06-30';
  const startYear = cycleYear - 1;
  const endYear = cycleYear;
  return {
    cycle_year: cycleYear,
    start_date: `${startYear}-${periodStart}`,
    end_date: `${endYear}-${periodEnd}`,
  };
}

export default function HrPerformanceReviewCyclesPage() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const router = useRouter();

  const [cycles, setCycles] = useState<HRPerformanceReviewCycle[]>([]);
  const [policy, setPolicy] = useState<HRPerformanceReviewPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formCycleYear, setFormCycleYear] = useState<number>(0);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Initial load — cycles + policy in parallel.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [c, p] = await Promise.all([
          PerformanceReviewService.listCycles(supabase),
          PerformanceReviewService.getPolicy(supabase),
        ]);
        if (cancelled) return;
        setCycles(c);
        setPolicy(p);
        // Pre-fill form defaults from policy.
        const d = defaultsFromPolicy(p);
        setFormCycleYear(d.cycle_year);
        setFormStartDate(d.start_date);
        setFormEndDate(d.end_date);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load cycles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function refresh() {
    setLoading(true);
    try {
      const c = await PerformanceReviewService.listCycles(supabase);
      setCycles(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!formCycleYear || !formStartDate || !formEndDate) {
      toast.error('Year, start date, and end date are required.');
      return;
    }
    setSubmitting(true);
    try {
      const row = await PerformanceReviewService.createCycle(supabase, {
        cycle_year: formCycleYear,
        start_date: formStartDate,
        end_date: formEndDate,
        description: formDescription || null,
        status: 'draft',
      });
      toast.success(`Cycle ${row.cycle_year} created.`);
      setShowForm(false);
      setFormDescription('');
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Create failed.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SuperAdminOnly>
    <ContentLayout title="Performance Review Cycles">
      <div className="space-y-4">
        {/* Policy summary banner — load-bearing context for the Director. */}
        <Alert>
          <CalendarRange className="h-4 w-4" />
          <AlertTitle>Policy summary</AlertTitle>
          <AlertDescription className="text-sm">
            {policy ? (
              <span>
                Appraisal cycle runs from{' '}
                <strong>{policy.period_start ?? '07-01'}</strong> to{' '}
                <strong>{policy.period_end ?? '06-30'}</strong> each year.
                Minimum service to be reviewed:{' '}
                <strong>{policy.min_service_months_for_review ?? 6} months</strong>.
                Review committee: <strong>{policy.review_committee ?? 'SEDC'}</strong>.
                Final approver: <strong>{policy.final_approver ?? 'Director'}</strong>.
              </span>
            ) : (
              <span>
                <code>hr.performance_review</code> policy not yet seeded — using
                defaults. Set it via <code>/hr/admin/policies/performance-review</code> when ready.
              </span>
            )}
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">All cycles</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                <span className="ml-2">Refresh</span>
              </Button>
              <Button size="sm" onClick={() => setShowForm((s) => !s)}>
                <Plus className="h-4 w-4" />
                <span className="ml-2">{showForm ? 'Hide form' : 'New cycle'}</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {showForm && (
              <div className="mb-6 rounded-md border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-semibold">Create a new cycle</h4>
                <p className="text-xs text-muted-foreground">
                  Year is the year the cycle ENDS (e.g. 2027 = Jul 2026 → Jun 2027). Dates
                  default from the policy window — edit if your cycle is non-standard.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="cycle_year">Cycle year (ends)</Label>
                    <Input
                      id="cycle_year"
                      type="number"
                      value={formCycleYear}
                      onChange={(e) => setFormCycleYear(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="start_date">Start date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_date">End date</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Notes (optional)</Label>
                  <Textarea
                    id="description"
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g. SEDC composition change for this cycle, special instructions."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreate} disabled={submitting}>
                    {submitting ? 'Creating…' : 'Create cycle'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Loading cycles…
              </div>
            ) : cycles.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No cycles yet. Create the first one to start collecting self-appraisals.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-4">Cycle year</th>
                      <th className="py-2 pr-4">Window</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Notes</th>
                      <th className="py-2 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => (
                      <tr key={c.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-medium">{c.cycle_year}</td>
                        <td className="py-2 pr-4">
                          {c.start_date} → {c.end_date}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-2 pr-4 max-w-xs truncate text-muted-foreground">
                          {c.description ?? '—'}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <Link
                            href={`/hr/admin/performance-reviews/cycles/${c.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Open →
                          </Link>
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
