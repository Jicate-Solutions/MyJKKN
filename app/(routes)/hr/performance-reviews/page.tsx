// ============================================================================
// HR — Staff Self-Appraisal (T5.1, staff self-service surface)
// ============================================================================
// Staff lands here, sees the current OPEN cycle (if any), and fills the
// self_appraisal_jsonb payload. State transitions: draft (save) →
// self_submitted (submit). After self_submitted the form is read-only until
// the supervisor (dept HoD) bounces it back or moves it forward.
//
// Routing model: looks up the staff's own row via staff.profile_id = auth.uid().
// Spec: specs/hr-module-decomposition-2026-05-09.md (T5.1)
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ClipboardCheck, Save, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  PerformanceReviewService,
  type HRPerformanceReview,
  type HRPerformanceReviewCycle,
  type HRPerformanceReviewPolicy,
  type ReviewStatus,
} from '@/lib/services/hr/performance-review-service';

const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Draft (you can keep editing)',
  self_submitted: 'Submitted — waiting for supervisor',
  supervisor_reviewed: 'Supervisor reviewed — waiting for SEDC',
  sedc_reviewed: 'SEDC reviewed — waiting for Director',
  final_approved: 'Final approved',
};

interface SelfAppraisalShape {
  achievements: string;
  goals_next_year: string;
  challenges: string;
  self_rating: number; // 1-10
}

const EMPTY: SelfAppraisalShape = {
  achievements: '',
  goals_next_year: '',
  challenges: '',
  self_rating: 0,
};

function coerceShape(raw: Record<string, unknown> | null): SelfAppraisalShape {
  if (!raw) return EMPTY;
  return {
    achievements: typeof raw.achievements === 'string' ? raw.achievements : '',
    goals_next_year: typeof raw.goals_next_year === 'string' ? raw.goals_next_year : '',
    challenges: typeof raw.challenges === 'string' ? raw.challenges : '',
    self_rating: typeof raw.self_rating === 'number' ? raw.self_rating : 0,
  };
}

export default function HrSelfAppraisalPage() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [openCycle, setOpenCycle] = useState<HRPerformanceReviewCycle | null>(null);
  const [policy, setPolicy] = useState<HRPerformanceReviewPolicy | null>(null);
  const [review, setReview] = useState<HRPerformanceReview | null>(null);
  const [form, setForm] = useState<SelfAppraisalShape>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load: resolve staff row + open cycle + policy + existing review.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1. Resolve the staff row for the logged-in user.
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error('You are not signed in.');
        const { data: staff, error: staffErr } = await supabase
          .from('staff')
          .select('id')
          .eq('profile_id', auth.user.id)
          .maybeSingle();
        if (staffErr) throw staffErr;
        if (!staff) throw new Error('No staff record linked to your account.');
        if (cancelled) return;
        setStaffId(staff.id);

        // 2. Find the most recent open cycle.
        const cycles = await PerformanceReviewService.listCycles(supabase);
        const open = cycles.find((c) => c.status === 'open') ?? null;
        if (cancelled) return;
        setOpenCycle(open);

        // 3. Policy summary (advisory only).
        const p = await PerformanceReviewService.getPolicy(supabase);
        if (cancelled) return;
        setPolicy(p);

        // 4. Existing review row (if any).
        if (open) {
          const r = await PerformanceReviewService.getMyReview(supabase, open.id, staff.id);
          if (cancelled) return;
          setReview(r);
          setForm(coerceShape(r?.self_appraisal_jsonb ?? null));
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const readonly = review?.status && review.status !== 'draft';

  async function save(submit: boolean) {
    if (!openCycle || !staffId) return;
    if (submit) {
      // Light validation before lock.
      if (!form.achievements.trim() || !form.goals_next_year.trim()) {
        toast.error('Achievements and goals are required to submit.');
        return;
      }
      if (form.self_rating < 1 || form.self_rating > 10) {
        toast.error('Self-rating must be between 1 and 10.');
        return;
      }
    }
    setSaving(true);
    try {
      const row = await PerformanceReviewService.upsertSelfAppraisal(supabase, {
        cycleId: openCycle.id,
        staffId,
        payload: form as unknown as Record<string, unknown>,
        submit,
      });
      setReview(row);
      toast.success(submit ? 'Submitted to your supervisor.' : 'Saved as draft.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentLayout title="My Performance Review">
      <div className="space-y-4">
        {policy && (
          <Alert>
            <ClipboardCheck className="h-4 w-4" />
            <AlertTitle>Annual appraisal — how this works</AlertTitle>
            <AlertDescription className="text-sm">
              You fill the form below. Once submitted, your{' '}
              <strong>dept HoD</strong> reviews it. Then the{' '}
              <strong>{policy.review_committee ?? 'SEDC'}</strong> committee
              moderates and the <strong>{policy.final_approver ?? 'Director'}</strong> stamps
              the final score. Minimum service to be reviewed:{' '}
              <strong>{policy.min_service_months_for_review ?? 6} months</strong>.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !openCycle ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No open appraisal cycle right now. Check back when HR opens the next one.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">
                Cycle {openCycle.cycle_year}
                <span className="ml-3 text-sm font-normal text-muted-foreground">
                  {openCycle.start_date} → {openCycle.end_date}
                </span>
              </CardTitle>
              {review && <Badge variant="outline">{REVIEW_STATUS_LABEL[review.status]}</Badge>}
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="achievements">Key achievements this year</Label>
                <Textarea
                  id="achievements"
                  rows={4}
                  value={form.achievements}
                  onChange={(e) => setForm((f) => ({ ...f, achievements: e.target.value }))}
                  disabled={readonly}
                  placeholder="What did you accomplish? Be specific — outcomes, dates, numbers."
                />
              </div>

              <div>
                <Label htmlFor="goals">Goals for next year</Label>
                <Textarea
                  id="goals"
                  rows={3}
                  value={form.goals_next_year}
                  onChange={(e) => setForm((f) => ({ ...f, goals_next_year: e.target.value }))}
                  disabled={readonly}
                  placeholder="What do you plan to focus on?"
                />
              </div>

              <div>
                <Label htmlFor="challenges">Challenges / support needed</Label>
                <Textarea
                  id="challenges"
                  rows={2}
                  value={form.challenges}
                  onChange={(e) => setForm((f) => ({ ...f, challenges: e.target.value }))}
                  disabled={readonly}
                  placeholder="Optional. Blockers, resources, training requests."
                />
              </div>

              <div className="max-w-xs">
                <Label htmlFor="rating">Self-rating (1-10)</Label>
                <Input
                  id="rating"
                  type="number"
                  min={1}
                  max={10}
                  value={form.self_rating || ''}
                  onChange={(e) => setForm((f) => ({ ...f, self_rating: Number(e.target.value) }))}
                  disabled={readonly}
                />
              </div>

              {!readonly && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => save(false)} disabled={saving}>
                    <Save className="h-4 w-4" />
                    <span className="ml-2">{saving ? 'Saving…' : 'Save draft'}</span>
                  </Button>
                  <Button onClick={() => save(true)} disabled={saving}>
                    <Send className="h-4 w-4" />
                    <span className="ml-2">{saving ? 'Submitting…' : 'Submit to supervisor'}</span>
                  </Button>
                </div>
              )}
              {readonly && (
                <p className="text-sm text-muted-foreground">
                  This appraisal is locked for editing. Talk to your supervisor or HR
                  if you need a change.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Supervisor of a team?{' '}
          <Link href="/hr/performance-reviews/team" className="text-primary hover:underline">
            Open the team review board →
          </Link>
        </p>
      </div>
    </ContentLayout>
  );
}
