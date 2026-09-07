'use client';

/**
 * ImageTagQuestion — canvas with the patient/clinical image, capturing a
 * click point and shipping it to /api/pde/clinical-reasoning/mark-image-tag
 * for SERVER-SIDE scoring.
 *
 * The answer key (expected_regions) is never shipped to the browser —
 * fn_pde_get_case_questions strips it, so scoring cannot happen client-side.
 * The marking route reads expected_regions with the service-role client (after
 * verifying the caller may attempt the case) and returns only the region score.
 *
 * Image source: question.question_media_url.
 *
 * Because marking is a live server round-trip it can fail. When it does, the
 * learner's click is recorded with the score left UNRESOLVED rather than
 * discarded, and no score is displayed — we cannot honestly show a percentage
 * the server never returned. This mirrors the treatment MCQWarmupQuestion and
 * FreeTextSocraticQuestion already received; image_tag was the one variant
 * still throwing the learner's work away on a platform failure, which made a
 * failed mark indistinguishable from a skip.
 */

import { useRef, useState } from 'react';
import {
  fetchWithClinicalTimeout,
  CLINICAL_MARK_TIMEOUT_MS,
} from '@/hooks/pde/use-clinical-reasoning';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
  ImageTagClickPoint,
} from '@/types/pde-clinical-reasoning';

/**
 * Local widening of ClinicalAnswerEnvelope.
 *
 * `marking_failed` distinguishes "clicked here, never scored" from "never
 * answered" (no envelope at all). It reaches pde_submissions.answers verbatim
 * (schemaless JSONB, inserted as-is by useCompleteAttempt), so faculty can
 * re-mark rather than guess. Declared here rather than widening
 * types/pde-clinical-reasoning.ts so this fix cannot collide with concurrent
 * edits to that shared module — the same choice the two sibling renderers made.
 *
 * Note on auto_score: CaseAttempt computes it as `region_score ?? 0` over every
 * scorable question, so an unresolved answer still contributes zero, exactly as
 * a skip would. That is deliberate — we genuinely do not know the score, and
 * final_score is overwritten server-side afterwards. What changes here is that
 * the click survives into the submitted attempt at all, instead of vanishing.
 */
type ImageTagAnswerEnvelope = ClinicalAnswerEnvelope & { marking_failed?: true };

interface ImageTagQuestionProps {
  question: ClinicalQuestion;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function ImageTagQuestion({
  question,
  onAnswered,
  onContinue,
  isLastQuestion,
}: ImageTagQuestionProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [click, setClick] = useState<ImageTagClickPoint | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [matchedLabel, setMatchedLabel] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [savedUnscored, setSavedUnscored] = useState(false);

  const mediaUrl = question.question_media_url;

  /**
   * Hand the click up with no score attached. Safe to call repeatedly:
   * CaseAttempt.recordAnswer overwrites by question_id, so a later successful
   * retry updates this same envelope instead of adding a second one. Re-reads
   * the current click each time, so moving the point after a failure saves the
   * point the learner can actually see marked on the image.
   */
  function recordUnscored() {
    if (!click) return;
    const envelope: ImageTagAnswerEnvelope = {
      question_id: question.id,
      question_type: 'image_tag',
      click_point: click,
      marking_failed: true,
      submitted_at: new Date().toISOString(),
    };
    onAnswered(envelope);
    setSavedUnscored(true);
  }

  function continueUnscored() {
    // Re-record first so a post-failure move of the point is what gets saved.
    recordUnscored();
    onContinue();
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (submitted) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    // Translate display-pixel click to natural-pixel coordinates for storage.
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setClick({
      x,
      y,
      imgWidth: img.naturalWidth,
      imgHeight: img.naturalHeight,
    });
  }

  async function submit() {
    if (!click || marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      // Scoring is server-side: expected_regions never reaches the browser.
      // Bounded: without a deadline a hung request never rejects, so the catch
      // below never runs and the click is never recorded at all.
      const res = await fetchWithClinicalTimeout(
        '/api/pde/clinical-reasoning/mark-image-tag',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_id: question.id, click_point: click }),
        },
        CLINICAL_MARK_TIMEOUT_MS,
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Scoring failed (${res.status})`);
      }
      const data = (await res.json()) as { region_score?: number; matched_label?: string | null };
      const regionScore = typeof data.region_score === 'number' ? data.region_score : 0;
      setScore(regionScore);
      setMatchedLabel(data.matched_label ?? undefined);
      setSubmitted(true);
      onAnswered({
        question_id: question.id,
        question_type: 'image_tag',
        click_point: click,
        region_score: regionScore,
        submitted_at: new Date().toISOString(),
      });
      setSavedUnscored(false);
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not score this click. Please try again.',
      );
      // A scoring outage must not discard the learner's click. Note we do NOT
      // set `submitted` — that would render "Score: 0%" and lock the image,
      // asserting a result the server never produced.
      recordUnscored();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div>
      <h3 className="mt-2 text-base font-semibold sm:text-lg">{question.question_text}</h3>
      {question.metadata?.osce_domain ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Domain: {question.metadata.osce_domain.replace(/_/g, ' ')}
        </p>
      ) : null}

      <div className="relative mt-4 overflow-hidden rounded-md border bg-muted">
        {mediaUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={mediaUrl}
              alt="Clinical image — click on the relevant feature"
              onClick={handleImageClick}
              className={`w-full max-h-[60vh] object-contain ${submitted ? 'cursor-default' : 'cursor-crosshair'}`}
            />
            {click ? (
              <div
                aria-hidden
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 bg-amber-200/50"
                style={{
                  left: `${(click.x / click.imgWidth) * 100}%`,
                  top: `${(click.y / click.imgHeight) * 100}%`,
                }}
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No image attached to this question.
          </div>
        )}
      </div>

      {!submitted ? (
        <div className="mt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={submit}
              disabled={!click || marking}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {marking ? 'Scoring…' : 'Submit click'}
            </button>
            <span className="text-xs text-muted-foreground">
              {markError
                ? <span className="text-red-600">{markError}</span>
                : click
                  ? 'Point captured — submit to score'
                  : 'Click on the image to mark your answer'}
            </span>
          </div>
          {/*
            The attempt is written to pde_submissions in one INSERT on the final
            question, so with no way past a scoring outage the whole attempt was
            lost, not just this answer. Submit click above is still the preferred
            path — this keeps the click on record when scoring stays down.
          */}
          {savedUnscored ? (
            <div
              className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
              aria-live="polite"
            >
              <p>
                Your click has been saved but could not be scored right now, so it has
                no score yet. Try again above, or move on — the point you marked stays
                on record and can be scored later.
              </p>
              <button
                type="button"
                onClick={continueUnscored}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {isLastQuestion ? 'Submit attempt without scoring' : 'Continue without scoring'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Score: <strong>{Math.round(score ?? 0)}%</strong>
            {matchedLabel ? <span className="ml-2 opacity-80">({matchedLabel})</span> : null}
          </div>
          <button
            type="button"
            onClick={onContinue}
            className="mt-3 inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            {isLastQuestion ? 'Submit attempt' : 'Continue to next question'}
          </button>
        </div>
      )}

    </div>
  );
}
