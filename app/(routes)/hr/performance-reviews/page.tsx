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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ClipboardCheck, Save, Send, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RatingPicker } from '@/features/hr/appraisal/rating-picker';
import {
  collegialityExampleMissing,
  missingAreas,
  parseCollegialityExample,
  parseRatings,
  parseSentBackReason,
  resolveAreas,
  AREA_LABELS,
  type AppraisalRatingMap,
} from '@/lib/hr/appraisal-ratings';
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
  /** Exceeds / Meets / Below per area — replaces the old 1-10 self_rating. */
  ratings: AppraisalRatingMap;
  collegiality_example: string;
}

const EMPTY: SelfAppraisalShape = {
  achievements: '',
  goals_next_year: '',
  challenges: '',
  ratings: {},
  collegiality_example: '',
};

/**
 * Rows saved before the three-rating model hold a `self_rating` number. That
 * number is deliberately NOT converted into a band: nobody knows whether a 7
 * out of 10 meant Meets or Exceeds, and guessing would put words in a
 * reviewer's mouth. Such a draft simply reopens with the areas unrated.
 */
function coerceShape(raw: Record<string, unknown> | null): SelfAppraisalShape {
  if (!raw) return EMPTY;
  return {
    achievements: typeof raw.achievements === 'string' ? raw.achievements : '',
    goals_next_year: typeof raw.goals_next_year === 'string' ? raw.goals_next_year : '',
    challenges: typeof raw.challenges === 'string' ? raw.challenges : '',
    ratings: parseRatings(raw, resolveAreas()),
    collegiality_example: parseCollegialityExample(raw),
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
          .select('id, institution_id')
          .eq('profile_id', auth.user.id)
          .maybeSingle();
        if (staffErr) throw staffErr;
        if (!staff) throw new Error('No staff record linked to your account.');
        if (cancelled) return;
        setStaffId(staff.id);

        // 2. The open round that applies to THIS person. A round now belongs
        //    to a college; their own college's round wins over a group-wide
        //    one, and row-level security has already hidden other colleges'.
        const cycles = await PerformanceReviewService.listCycles(supabase);
        const open = PerformanceReviewService.pickOpenCycle(
          cycles,
          (staff.institution_id as string | null) ?? null,
        );
        if (cancelled) return;
        setOpenCycle(open);

        // 3. Policy for the person's own college (falls back to the group
        //    value). A college can switch the Collegiality example off.
        const p = await PerformanceReviewService.getPolicy(
          supabase,
          (staff.institution_id as string | null) ?? null,
        );
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
      const areas = resolveAreas();
      const unrated = missingAreas(form.ratings, areas);
      if (unrated.length > 0) {
        toast.error(
          `Rate every area before submitting. Still to rate: ${unrated
            .map((a) => AREA_LABELS[a])
            .join(', ')}.`,
        );
        return;
      }
      if (collegialityExampleMissing(form.ratings, form.collegiality_example, policy)) {
        toast.error('A Below in Collegiality needs a written example.');
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
              {review?.status === 'draft' && parseSentBackReason(review.supervisor_review_jsonb, 'head') && (
                <Alert>
                  <Undo2 className="h-4 w-4" />
                  <AlertTitle>Your head of department sent this back</AlertTitle>
                  <AlertDescription>
                    {parseSentBackReason(review.supervisor_review_jsonb, 'head')}
                  </AlertDescription>
                </Alert>
              )}
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

              <div className="border-t pt-5">
                <h3 className="text-sm font-semibold">How would you rate your year?</h3>
                <p className="mt-1 mb-3 text-xs text-muted-foreground">
                  Four areas, three bands each. There is no total and no percentage —
                  your supervisor and the committee see these same four words.
                </p>
                <RatingPicker
                  idPrefix="self"
                  areas={resolveAreas()}
                  value={form.ratings}
                  onChange={(ratings) => setForm((f) => ({ ...f, ratings }))}
                  collegialityExample={form.collegiality_example}
                  onCollegialityExampleChange={(collegiality_example) =>
                    setForm((f) => ({ ...f, collegiality_example }))
                  }
                  policy={policy}
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
