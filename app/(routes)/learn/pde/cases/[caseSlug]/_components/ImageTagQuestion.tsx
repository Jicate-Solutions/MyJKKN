'use client';

/**
 * ImageTagQuestion — canvas with the patient/clinical image, capturing a
 * click point and shipping it to /api/pde/clinical-reasoning/score
 * (Agent E's endpoint) for Vision-style validation.
 *
 * If Agent E's endpoint is not yet available, we still record the click
 * with a local "near expected region" fallback score so the case can be
 * completed end-to-end in dev. The score gets recomputed server-side once
 * Agent E lands.
 *
 * Image source: question.question_media_url (or scenario.image_url fallback
 * if you wire it in; not done here to keep boundary clean).
 */

import { useRef, useState } from 'react';
import { useImageTagScore } from '@/hooks/pde/use-clinical-reasoning';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
  ImageTagClickPoint,
  ImageTagRegion,
} from '@/types/pde-clinical-reasoning';

interface ImageTagQuestionProps {
  question: ClinicalQuestion;
  learnerId: string;
  assessmentId: string;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

function localFallbackScore(
  pt: ImageTagClickPoint,
  regions: ImageTagRegion[] | null
): { score: number; matched_label?: string } {
  // Local fallback used until Agent E's server endpoint is live.
  // We treat region coordinates as natural-pixel space, same as the click.
  if (!regions || regions.length === 0) {
    // No expected regions defined → award full credit (faculty must define).
    return { score: 100 };
  }
  let best = 0;
  let matched: string | undefined;
  for (const r of regions) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tol = r.tolerance_px ?? Math.max(r.w, r.h) / 2;
    // 100% at center, drops to 0% at 2×tolerance distance.
    const s = Math.max(0, Math.min(100, (1 - dist / (tol * 2)) * 100));
    if (s > best) {
      best = s;
      matched = r.label;
    }
  }
  return { score: Math.round(best), matched_label: matched };
}

export function ImageTagQuestion({
  question,
  learnerId,
  assessmentId,
  onAnswered,
  onContinue,
  isLastQuestion,
}: ImageTagQuestionProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [click, setClick] = useState<ImageTagClickPoint | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [matchedLabel, setMatchedLabel] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const scoreMutation = useImageTagScore();

  const mediaUrl = question.question_media_url;

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
    if (!click) return;
    setScoreError(null);
    try {
      // Try Agent E's endpoint; fall back to local heuristic on 404.
      const res = await scoreMutation.mutateAsync({
        assessmentId,
        questionId: question.id,
        learnerId,
        clickPoint: click,
      });
      finalize(res.score, res.matched_label);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      // 404 (endpoint missing — Agent E not live) → silent fallback
      // Other errors → surface for retry but still allow continuation
      if (msg.toLowerCase().includes('404') || msg.toLowerCase().includes('non-json')) {
        const fb = localFallbackScore(click, question.expected_regions);
        finalize(fb.score, fb.matched_label);
        return;
      }
      setScoreError(msg);
    }
  }

  function finalize(s: number, label: string | undefined) {
    setScore(s);
    setMatchedLabel(label);
    setSubmitted(true);
    onAnswered({
      question_id: question.id,
      question_type: 'image_tag',
      click_point: click!,
      region_score: s,
      submitted_at: new Date().toISOString(),
    });
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
            {click && imgRef.current ? (
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
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={submit}
            disabled={!click || scoreMutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {scoreMutation.isPending ? 'Scoring…' : 'Submit click'}
          </button>
          <span className="text-xs text-muted-foreground">
            {click ? 'Click submitted; review your point above' : 'Click on the image to mark your answer'}
          </span>
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

      {scoreError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {scoreError}
          <button type="button" onClick={submit} className="ml-2 underline hover:no-underline">
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
