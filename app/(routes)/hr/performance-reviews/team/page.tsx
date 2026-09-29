// ============================================================================
// HR — Supervisor team review board (T5.1, dept HoD surface)
// ============================================================================
// Dept HoD lands here and sees self-submitted reviews for staff in their
// department. RLS filters the list automatically — we just fetch reviews
// for the current open cycle and let the policy do the row-level filtering.
//
// Action: HoD opens a row, adds supervisor_review_jsonb, transitions
// self_submitted → supervisor_reviewed. After that the SEDC committee
// (admin/SEDC-permissioned users) picks it up.
//
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
import { AlertCircle, ArrowLeft, RefreshCw, Send, Undo2, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RatingPicker } from '@/features/hr/appraisal/rating-picker';
import {
  collegialityExampleMissing,
  missingAreas,
  parseCollegialityExample,
  parseRatings,
  resolveAreas,
  AREA_LABELS,
  type AppraisalRatingMap,
  parseSentBackReason,
} from '@/lib/hr/appraisal-ratings';
import {
  PerformanceReviewService,
  type HRPerformanceReview,
  type HRPerformanceReviewCycle,
  type HRPerformanceReviewPolicy,
  type ReviewStatus,
} from '@/lib/services/hr/performance-review-service';

const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Staff drafting',
  self_submitted: 'Waiting for your review',
  supervisor_reviewed: 'You reviewed — with SEDC',
  sedc_reviewed: 'SEDC reviewed — with Director',
  final_approved: 'Final approved',
};

interface SupervisorReviewShape {
  validation_notes: string;
  /** Exceeds / Meets / Below per area — replaces the old 1-10 rating. */
  ratings: AppraisalRatingMap;
  collegiality_example: string;
  recommendations: string;
}

const EMPTY: SupervisorReviewShape = {
  validation_notes: '',
  ratings: {},
  collegiality_example: '',
  recommendations: '',
};

/** A pre-model row holds `supervisor_rating`; it is not converted to a band. */
function coerceShape(raw: Record<string, unknown> | null): SupervisorReviewShape {
  if (!raw) return EMPTY;
  return {
    validation_notes: typeof raw.validation_notes === 'string' ? raw.validation_notes : '',
    ratings: parseRatings(raw, resolveAreas()),
    collegiality_example: parseCollegialityExample(raw),
    recommendations: typeof raw.recommendations === 'string' ? raw.recommendations : '',
  };
}

export default function HrSupervisorTeamReviewPage() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [openCycle, setOpenCycle] = useState<HRPerformanceReviewCycle | null>(null);
  const [policy, setPolicy] = useState<HRPerformanceReviewPolicy | null>(null);
  const [reviews, setReviews] = useState<HRPerformanceReview[]>([]);
  const [selected, setSelected] = useState<HRPerformanceReview | null>(null);
  const [form, setForm] = useState<SupervisorReviewShape>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // The head of department is a staff member too — their own college
        // decides which round they are reviewing within.
        const { data: auth } = await supabase.auth.getUser();
        let hodInstitutionId: string | null = null;
        if (auth?.user) {
          const { data: me } = await supabase
            .from('staff')
            .select('institution_id')
            .eq('profile_id', auth.user.id)
            .maybeSingle();
          hodInstitutionId = (me?.institution_id as string | null) ?? null;
        }

        const cycles = await PerformanceReviewService.listCycles(supabase);
        // The head of department reviews within their own college's round. RLS
        // hides other colleges' rounds; pickOpenCycle only has to choose between
        // a college round and a group-wide one.
        const open =
          PerformanceReviewService.pickOpenCycle(cycles, hodInstitutionId) ??
          cycles.find((c) => c.status === 'locked') ??
          null;
        if (cancelled) return;
        setOpenCycle(open);
        if (open) {
          const rs = await PerformanceReviewService.listTeamReviews(supabase, open.id);
          const pol = await PerformanceReviewService.getPolicy(supabase);
          setPolicy(pol);
          if (cancelled) return;
          setReviews(rs);
        } else {
          setReviews([]);
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

  async function refresh() {
    if (!openCycle) return;
    setLoading(true);
    try {
      const rs = await PerformanceReviewService.listTeamReviews(supabase, openCycle.id);
      setReviews(rs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setLoading(false);
    }
  }

  function openReview(r: HRPerformanceReview) {
    setSelected(r);
    setForm(coerceShape(r.supervisor_review_jsonb));
  }

  function closeReview() {
    setSelected(null);
    setForm(EMPTY);
    setSendBackReason('');
  }

  // The head's other choice: return the self-appraisal to the person to
  // redo, instead of reviewing it as it stands. The database and sendBack()
  // always allowed self_submitted -> draft; no screen offered it (caught in
  // the round-3 review).
  async function sendBackToPerson() {
    if (!selected) return;
    if (!sendBackReason.trim()) {
      toast.error('Say what the person should change, so they can act on it.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await PerformanceReviewService.sendBack(
        supabase,
        selected.id,
        'draft',
        sendBackReason,
      );
      toast.success('Sent back to the person to redo.');
      setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      closeReview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send back.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReview() {
    if (!selected) return;
    if (!form.validation_notes.trim()) {
      toast.error('Validation notes are required.');
      return;
    }
    const areas = resolveAreas();
    const unrated = missingAreas(form.ratings, areas);
    if (unrated.length > 0) {
      toast.error(
        `Rate every area. Still to rate: ${unrated.map((a) => AREA_LABELS[a]).join(', ')}.`,
      );
      return;
    }
    if (collegialityExampleMissing(form.ratings, form.collegiality_example, policy)) {
      toast.error('A Below in Collegiality needs a written example.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await PerformanceReviewService.submitSupervisorReview(
        supabase,
        selected.id,
        form as unknown as Record<string, unknown>,
      );
      toast.success('Review submitted to SEDC.');
      setReviews((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      closeReview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const pending = reviews.filter((r) => r.status === 'self_submitted');
  const others = reviews.filter((r) => r.status !== 'self_submitted');

  if (selected) {
    return (
      <ContentLayout title="Review a team member">
        <div className="space-y-4">
          <button
            className="inline-flex items-center text-sm text-muted-foreground hover:underline"
            onClick={closeReview}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to team board
          </button>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Staff (id): <span className="font-mono text-xs">{selected.staff_id.slice(0, 8)}…</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {parseSentBackReason(selected.supervisor_review_jsonb, 'committee') && (
                <Alert>
                  <Undo2 className="h-4 w-4" />
                  <AlertTitle>The committee sent this back to you</AlertTitle>
                  <AlertDescription>
                    {parseSentBackReason(selected.supervisor_review_jsonb, 'committee')}
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <h4 className="text-sm font-semibold mb-2">Self-appraisal (read-only)</h4>
                <pre className="rounded bg-muted/30 p-3 text-xs whitespace-pre-wrap max-h-64 overflow-auto">
                  {JSON.stringify(selected.self_appraisal_jsonb ?? {}, null, 2)}
                </pre>
              </div>

              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold">Your review</h4>

                <div>
                  <Label htmlFor="validation">Validation notes</Label>
                  <Textarea
                    id="validation"
                    rows={4}
                    value={form.validation_notes}
                    onChange={(e) => setForm((f) => ({ ...f, validation_notes: e.target.value }))}
                    placeholder="Validate or push back on the achievements. Add context the SEDC needs."
                  />
                </div>

                <div className="border-t pt-4">
                  <h5 className="text-sm font-semibold">Your rating</h5>
                  <p className="mt-1 mb-3 text-xs text-muted-foreground">
                    What the person gave themselves is shown beside each area. You are not
                    required to agree with it.
                  </p>
                  <RatingPicker
                    idPrefix="sup"
                    areas={resolveAreas()}
                    value={form.ratings}
                    onChange={(ratings) => setForm((f) => ({ ...f, ratings }))}
                    collegialityExample={form.collegiality_example}
                    onCollegialityExampleChange={(collegiality_example) =>
                      setForm((f) => ({ ...f, collegiality_example }))
                    }
                    policy={policy}
                    prior={parseRatings(selected.self_appraisal_jsonb, resolveAreas())}
                    priorLabel="Self"
                  />
                </div>

                <div>
                  <Label htmlFor="recs">Recommendations (optional)</Label>
                  <Textarea
                    id="recs"
                    rows={2}
                    value={form.recommendations}
                    onChange={(e) => setForm((f) => ({ ...f, recommendations: e.target.value }))}
                    placeholder="Promotion candidate, training need, etc."
                  />
                </div>

                <Button onClick={submitReview} disabled={submitting}>
                  <Send className="h-4 w-4" />
                  <span className="ml-2">{submitting ? 'Submitting…' : 'Submit to SEDC'}</span>
                </Button>
              </div>

              {selected.status === 'self_submitted' && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="text-sm font-semibold">Or send it back to the person</h4>
                  <p className="text-xs text-muted-foreground">
                    Use this when the self-appraisal is incomplete or needs evidence. It
                    returns to them as a draft, with your note shown at the top.
                  </p>
                  <Label htmlFor="send-back-reason">What should they change?</Label>
                  <Textarea
                    id="send-back-reason"
                    rows={2}
                    value={sendBackReason}
                    onChange={(e) => setSendBackReason(e.target.value)}
                    placeholder="For example: attach the evidence for March, with dates."
                  />
                  <Button variant="outline" onClick={sendBackToPerson} disabled={submitting}>
                    <Undo2 className="h-4 w-4" />
                    <span className="ml-2">Send back to the person</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Team performance reviews">
      <div className="space-y-4">
        <Link
          href="/hr/performance-reviews"
          className="inline-flex items-center text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to my appraisal
        </Link>

        <Alert>
          <UsersRound className="h-4 w-4" />
          <AlertTitle>You are a supervisor</AlertTitle>
          <AlertDescription className="text-sm">
            Rows below are appraisals for staff in your department. Review the ones marked
            <em> &ldquo;Waiting for your review&rdquo; </em> and push them to the SEDC committee.
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
            <CardTitle className="text-base">
              {openCycle ? `Cycle ${openCycle.cycle_year}` : 'No active cycle'}
            </CardTitle>
            {openCycle && (
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : !openCycle ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No open or locked cycle right now.
              </div>
            ) : reviews.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No team appraisals in this cycle yet (or RLS scoped them out — you must be
                a department HoD to see any).
              </div>
            ) : (
              <div className="space-y-6">
                <ReviewTable
                  title={`Waiting for your review (${pending.length})`}
                  rows={pending}
                  onOpen={openReview}
                  emptyMsg="No appraisals waiting for your review."
                />
                <ReviewTable
                  title={`Other appraisals (${others.length})`}
                  rows={others}
                  onOpen={openReview}
                  emptyMsg="No other appraisals to show."
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function ReviewTable({
  title,
  rows,
  onOpen,
  emptyMsg,
}: {
  title: string;
  rows: HRPerformanceReview[];
  onOpen: (r: HRPerformanceReview) => void;
  emptyMsg: string;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Staff (ID)</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Submitted</th>
              <th className="py-2 pr-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="py-2 pr-4 font-mono text-xs">{r.staff_id.slice(0, 8)}…</td>
                <td className="py-2 pr-4">
                  <Badge variant="outline">{REVIEW_STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {r.self_submitted_at ? new Date(r.self_submitted_at).toLocaleDateString() : '—'}
                </td>
                <td className="py-2 pr-4 text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(r)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
