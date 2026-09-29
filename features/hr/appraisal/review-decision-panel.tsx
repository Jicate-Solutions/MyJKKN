'use client';

/**
 * The two review steps that had no screen at all: the committee's
 * normalisation, and the Director's sign-off.
 *
 * Before this, an appraisal could reach `supervisor_reviewed` and then stop —
 * there was no way in the product to finish one. Both steps live in one
 * component because they show the same thing (every tier's ratings side by
 * side) and differ only in what the reviewer may do next.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, CheckCircle2, Send, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { RatingBadge, RatingPicker } from '@/features/hr/appraisal/rating-picker';
import {
  AREA_LABELS,
  collegialityExampleMissing,
  deriveAppraisalScore,
  incrementBlocked,
  missingAreas,
  parseCollegialityExample,
  parseRatings,
  resolveAreas,
  resolveRatingPoints,
  summariseRatings,
  type AppraisalRatingMap,
} from '@/lib/hr/appraisal-ratings';
import {
  PerformanceReviewService,
  type HRPerformanceReview,
  type HRPerformanceReviewPolicy,
} from '@/lib/services/hr/performance-review-service';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Props {
  supabase: SupabaseClient;
  review: HRPerformanceReview;
  policy: HRPerformanceReviewPolicy | null;
  approverProfileId: string | null;
  onDone: (updated: HRPerformanceReview) => void;
  onClose: () => void;
}

export function ReviewDecisionPanel({
  supabase, review, policy, approverProfileId, onDone, onClose,
}: Props) {
  const areas = useMemo(() => resolveAreas(), []);
  const isCommitteeStep = review.status === 'supervisor_reviewed';
  const isDirectorStep = review.status === 'sedc_reviewed';

  const selfRatings = parseRatings(review.self_appraisal_jsonb, areas);
  const supRatings = parseRatings(review.supervisor_review_jsonb, areas);
  const sedcRatings = parseRatings(review.sedc_review_jsonb, areas);

  // Committee starts from the supervisor's ratings — normalising means
  // adjusting what the department said, not starting from a blank sheet.
  const [ratings, setRatings] = useState<AppraisalRatingMap>(
    Object.keys(sedcRatings).length > 0 ? sedcRatings : supRatings,
  );
  const [example, setExample] = useState(
    parseCollegialityExample(review.sedc_review_jsonb) ||
      parseCollegialityExample(review.supervisor_review_jsonb),
  );
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const approvedRatings = isDirectorStep ? sedcRatings : ratings;
  const previewScore = deriveAppraisalScore(
    approvedRatings, areas, resolveRatingPoints(policy), policy,
  );
  const blocked = incrementBlocked(approvedRatings, policy);

  async function submitCommittee() {
    const unrated = missingAreas(ratings, areas);
    if (unrated.length > 0) {
      toast.error(`Rate every area. Still to rate: ${unrated.map((a) => AREA_LABELS[a]).join(', ')}.`);
      return;
    }
    if (collegialityExampleMissing(ratings, example, policy)) {
      toast.error('A Below in Collegiality needs a written example.');
      return;
    }
    setBusy(true);
    try {
      const updated = await PerformanceReviewService.submitSedcReview(supabase, review.id, {
        ratings,
        collegiality_example: example,
        normalisation_notes: notes,
      });
      toast.success('Sent to the Director for sign-off.');
      onDone(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!approverProfileId) {
      toast.error('Your profile could not be identified, so this cannot be signed off.');
      return;
    }
    setBusy(true);
    try {
      const updated = await PerformanceReviewService.finalApprove(supabase, review.id, {
        final_remarks: notes,
        approver_profile_id: approverProfileId,
        policy,
      });
      toast.success('Appraisal approved and closed.');
      onDone(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    const to = isDirectorStep ? 'supervisor_reviewed' : 'self_submitted';
    setBusy(true);
    try {
      const updated = await PerformanceReviewService.sendBack(supabase, review.id, to, notes);
      toast.success('Sent back for rework.');
      onDone(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send back.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">
          {isDirectorStep ? 'Director sign-off' : 'Committee review'}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-2">Back to list</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Every tier, side by side. */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Area</th>
                <th className="py-2 pr-4">Self</th>
                <th className="py-2 pr-4">Supervisor</th>
                <th className="py-2 pr-4">Committee</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 font-medium">{AREA_LABELS[a]}</td>
                  <td className="py-2 pr-4"><RatingBadge rating={selfRatings[a]} /></td>
                  <td className="py-2 pr-4"><RatingBadge rating={supRatings[a]} /></td>
                  <td className="py-2 pr-4"><RatingBadge rating={sedcRatings[a]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isCommitteeStep && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold">The committee&rsquo;s ratings</h4>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Pre-filled from the supervisor. Change only what the committee decides
              differently, and say why below.
            </p>
            <RatingPicker
              idPrefix="sedc"
              areas={areas}
              value={ratings}
              onChange={setRatings}
              collegialityExample={example}
              onCollegialityExampleChange={setExample}
              policy={policy}
              prior={supRatings}
              priorLabel="Supervisor"
            />
          </div>
        )}

        <div className="border-t pt-4">
          <Label htmlFor="decision-notes">
            {isDirectorStep ? 'Your remarks' : 'Normalisation notes'}
          </Label>
          <Textarea
            id="decision-notes"
            rows={3}
            className="mt-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isDirectorStep
                ? 'Recorded against the appraisal. Required if you send it back.'
                : 'Why the committee changed, or kept, the supervisor&rsquo;s ratings.'
            }
          />
        </div>

        {/* What the ratings become for promotion — stated, not hidden. */}
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
          <p className="font-medium text-foreground">
            {summariseRatings(approvedRatings, areas)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {previewScore === null
              ? 'Every area must be rated before this can be approved.'
              : `Promotion reads this as ${previewScore} out of 100. That number exists only to ` +
                'order candidates; it is not the appraisal result and is not shown to the team member.'}
          </p>
          {blocked && (
            <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">
              These ratings stop the increment. This college has chosen that a Below in any
              counted area blocks it, whatever the score comes to. Approving records that
              outcome.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {isCommitteeStep && (
            <Button onClick={submitCommittee} disabled={busy}>
              <Send className="h-4 w-4" />
              <span className="ml-2">{busy ? 'Working…' : 'Send to Director'}</span>
            </Button>
          )}
          {isDirectorStep && (
            <Button onClick={approve} disabled={busy || previewScore === null}>
              <CheckCircle2 className="h-4 w-4" />
              <span className="ml-2">{busy ? 'Working…' : 'Approve and close'}</span>
            </Button>
          )}
          <Button variant="outline" onClick={sendBack} disabled={busy || !notes.trim()}>
            <Undo2 className="h-4 w-4" />
            <span className="ml-2">
              {/* The committee can only return it one step, to the head of
                  department — not all the way to the person. Labelled for
                  where it actually lands. */}
              {isDirectorStep ? 'Send back to committee' : 'Send back to the head of department'}
            </span>
          </Button>
          {!notes.trim() && (
            <p className="w-full text-xs text-muted-foreground">
              Sending back needs a reason.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
