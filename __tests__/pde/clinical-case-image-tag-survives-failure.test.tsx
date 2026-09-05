// @vitest-environment jsdom
/**
 * Regression guard for the image_tag question variant.
 *
 * Two defects, one learner outcome — the learner is punished for a platform
 * failure:
 *
 *   1. A failed mark discarded the click. The catch set an error and never
 *      called onAnswered, so no envelope reached pde_submissions.answers and
 *      the question was indistinguishable from a skip — scored zero with no
 *      record that the learner had answered at all. MCQWarmupQuestion and
 *      FreeTextSocraticQuestion were fixed for this; image_tag was not.
 *
 *   2. The fetches carried no AbortSignal and no client deadline, so a HUNG
 *      request never rejected. No error was raised, so neither Retry nor the
 *      continue-anyway control ever rendered, and defect 1's fix — which lives
 *      in the catch — never ran either. /api/pde/coach declares
 *      maxDuration = 300, so the server will hold a stalled upstream open for
 *      five minutes.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalQuestion } from '@/types/pde-clinical-reasoning';

import { ImageTagQuestion } from '@/app/(routes)/pde/learn/cases/[caseSlug]/_components/ImageTagQuestion';
import {
  fetchWithClinicalTimeout,
  CLINICAL_MARK_TIMEOUT_MS,
  CLINICAL_COACH_TIMEOUT_MS,
  CLINICAL_FINALIZE_TIMEOUT_MS,
} from '@/hooks/pde/use-clinical-reasoning';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const imageTagQuestion = {
  id: 'q-img-1',
  assessment_id: 'a-1',
  question_type: 'image_tag',
  question_text: 'Click on the lesion you would biopsy first.',
  question_media_url: 'https://example.test/lesion.jpg',
  options: null,
  correct_answer: null,
  order_index: 1,
  metadata: {
    q_number: 1,
    osce_domain: 'data_gathering',
    ground_truth: 'gt',
    key_concepts: [],
  },
  expected_regions: null,
} as ClinicalQuestion;

/**
 * jsdom reports 0 for naturalWidth/naturalHeight and an all-zero
 * getBoundingClientRect, which would make the computed click NaN and the
 * component's `if (!click)` guards behave unrealistically. Give the image real
 * dimensions so the click maths produces finite coordinates, as in a browser.
 */
function markImageAsLoaded(img: HTMLImageElement) {
  Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true });
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0 }) as DOMRect;
}

function clickImageAt(x: number, y: number) {
  const img = screen.getByRole('img') as HTMLImageElement;
  markImageAsLoaded(img);
  fireEvent.click(img, { clientX: x, clientY: y });
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ImageTagQuestion — a marking failure preserves the click', () => {
  it('records the click with the score left unresolved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Scorer unavailable' }, 500)));

    const onAnswered = vi.fn();
    render(
      <ImageTagQuestion
        question={imageTagQuestion}
        onAnswered={onAnswered}
        onContinue={vi.fn()}
        isLastQuestion={false}
      />,
    );

    clickImageAt(120, 90);
    fireEvent.click(screen.getByRole('button', { name: /submit click/i }));

    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));

    const envelope = onAnswered.mock.calls[0][0];
    expect(envelope.question_id).toBe('q-img-1');
    expect(envelope.question_type).toBe('image_tag');
    // The whole point: the click survives instead of being thrown away.
    expect(envelope.click_point).toBeDefined();
    expect(Number.isFinite(envelope.click_point.x)).toBe(true);
    expect(Number.isFinite(envelope.click_point.y)).toBe(true);
    // Unresolved, NOT 0 — the server never scored it.
    expect(envelope.region_score).toBeUndefined();
    expect(envelope.marking_failed).toBe(true);
    expect(typeof envelope.submitted_at).toBe('string');
  });

  it('never displays a score the server did not return', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Scorer unavailable' }, 500)));

    render(
      <ImageTagQuestion
        question={imageTagQuestion}
        onAnswered={vi.fn()}
        onContinue={vi.fn()}
        isLastQuestion={false}
      />,
    );

    clickImageAt(120, 90);
    fireEvent.click(screen.getByRole('button', { name: /submit click/i }));

    await waitFor(() => expect(screen.getByText(/scorer unavailable/i)).toBeInTheDocument());
    // Previously the component either showed nothing at all or, had it marked
    // itself submitted, would have asserted "Score: 0%".
    expect(screen.queryByText(/^Score:/)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be scored right now/i)).toBeInTheDocument();
  });

  it('offers a way forward so the whole attempt is not lost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Scorer unavailable' }, 500)));

    const onContinue = vi.fn();
    render(
      <ImageTagQuestion
        question={imageTagQuestion}
        onAnswered={vi.fn()}
        onContinue={onContinue}
        isLastQuestion={false}
      />,
    );

    clickImageAt(120, 90);
    fireEvent.click(screen.getByRole('button', { name: /submit click/i }));

    // Retry is the same "Submit click" button, still present and enabled.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit click/i })).toBeEnabled(),
    );

    // The attempt is written in one INSERT on the final question, so with no
    // way to advance a scoring outage discarded every answer, not just this one.
    fireEvent.click(screen.getByRole('button', { name: /continue without scoring/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('a later successful retry updates the same envelope instead of adding a second one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Scorer unavailable' }, 500)));

    const onAnswered = vi.fn();
    render(
      <ImageTagQuestion
        question={imageTagQuestion}
        onAnswered={onAnswered}
        onContinue={vi.fn()}
        isLastQuestion={false}
      />,
    );

    clickImageAt(120, 90);
    fireEvent.click(screen.getByRole('button', { name: /submit click/i }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));

    // Scorer comes back up.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ region_score: 82, matched_label: 'Ventral tongue' }, 200)),
    );

    fireEvent.click(screen.getByRole('button', { name: /submit click/i }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(2));

    const [first, second] = onAnswered.mock.calls.map((c) => c[0]);
    // Same question_id both times — CaseAttempt.recordAnswer overwrites by
    // question_id, so this is an update, never a duplicate answer row.
    expect(second.question_id).toBe(first.question_id);
    expect(second.region_score).toBe(82);
    expect(second.marking_failed).toBeUndefined();

    // And the recovery banner is gone once the mark succeeds.
    await waitFor(() => expect(screen.getByText(/Score:/)).toBeInTheDocument());
    expect(screen.queryByText(/could not be scored right now/i)).not.toBeInTheDocument();
  });

  it('bounds its marking request so a hang cannot strand the learner', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ region_score: 50 }, 200));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ImageTagQuestion
        question={imageTagQuestion}
        onAnswered={vi.fn()}
        onContinue={vi.fn()}
        isLastQuestion={false}
      />,
    );

    clickImageAt(120, 90);
    fireEvent.click(screen.getByRole('button', { name: /submit click/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The wiring half of defect 2: the request actually carries a deadline.
    // fetchWithClinicalTimeout's own test below proves the deadline fires.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fetchWithClinicalTimeout — a hang becomes an ordinary error', () => {
  it('rejects within the deadline instead of pending forever', async () => {
    // A server that accepts the request and then never answers — the exact
    // shape that previously left the learner on a spinner indefinitely.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject((init.signal as AbortSignal).reason),
            );
          }),
      ),
    );

    const startedAt = Date.now();
    // Real timers, tiny deadline: proves the mechanism without a 20s test.
    await expect(
      fetchWithClinicalTimeout('/api/pde/clinical-reasoning/mark-image-tag', { method: 'POST' }, 60),
    ).rejects.toThrow(/taking longer than expected/i);
    expect(Date.now() - startedAt).toBeLessThan(3_000);
  });

  it('tags the timeout retryable and keeps the raw DOMException text away from learners', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject((init.signal as AbortSignal).reason),
            );
          }),
      ),
    );

    const err = await fetchWithClinicalTimeout('/api/pde/coach', { method: 'POST' }, 60).catch(
      (e) => e as Error & { retryable?: boolean },
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.retryable).toBe(true);
    // "signal timed out" is not something to put in front of a learner.
    expect(err.message).not.toMatch(/signal timed out/i);
  });

  it('passes non-timeout failures through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await expect(
      fetchWithClinicalTimeout('/api/pde/coach', { method: 'POST' }, 5_000),
    ).rejects.toThrow(/failed to fetch/i);
  });

  it('keeps every deadline well inside the coach route maxDuration of 300s', () => {
    for (const ms of [
      CLINICAL_MARK_TIMEOUT_MS,
      CLINICAL_COACH_TIMEOUT_MS,
      CLINICAL_FINALIZE_TIMEOUT_MS,
    ]) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(300_000);
    }
    // The unscored marking route runs no AI, so it must not wait as long as
    // the two live-model calls.
    expect(CLINICAL_MARK_TIMEOUT_MS).toBeLessThan(CLINICAL_COACH_TIMEOUT_MS);
    // Whole-attempt rubric scoring is strictly more work than one coach turn.
    expect(CLINICAL_FINALIZE_TIMEOUT_MS).toBeGreaterThan(CLINICAL_COACH_TIMEOUT_MS);
  });
});
