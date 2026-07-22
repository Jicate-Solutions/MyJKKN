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
 */

import { useRef, useState } from 'react';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
  ImageTagClickPoint,
} from '@/types/pde-clinical-reasoning';

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
    if (!click || marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      // Scoring is server-side: expected_regions never reaches the browser.
      const res = await fetch('/api/pde/clinical-reasoning/mark-image-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id, click_point: click }),
      });
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
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not score this click. Please try again.',
      );
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
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
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
