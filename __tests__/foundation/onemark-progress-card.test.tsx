// @vitest-environment jsdom
//
// OneMark — the learner's "My progress" card asks Lane A's report API the way
// Lane A's route actually answers.
//
// The combined practice run (#3431) found the card fetching
// GET /api/foundation/onemark/results/learner/<studentId> with no `?exam=`;
// the route answers 400 `exam must be a uuid`, the card swallowed the non-OK
// response and rendered nothing on every practice-home load. The route tests
// could not see it (they never render the card) and the pure-reader tests
// could not either (they never fetch). So the mock here IS Lane A's contract:
// a uuid `exam` gets a report, anything else gets the 400 — and the card must
// still appear.
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProgressCard,
  defaultProgressSubject,
} from '@/app/(routes)/foundation/onemark/practice/_components/progress-card';

afterEach(() => cleanup());

const LEARNER_ID = '08f23565-4f0f-4fe8-b2e2-43a892afdb85';
const PHYSICS_EXAM = 'b72a99f1-1111-4ccc-8ddd-0000000000a1';
const ENGLISH_EXAM = 'c83b00a2-2222-4ccc-8ddd-0000000000b2';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUBJECTS = [
  { examDefinitionId: PHYSICS_EXAM, name: 'Physics', poolReady: true, questionCount: 5 },
  { examDefinitionId: ENGLISH_EXAM, name: 'English', poolReady: true, questionCount: 1 },
];

const REPORT = {
  sittings: [
    { score: 2, total: 5, submitted_at: '2026-09-12T14:20:00Z' },
    { score: 1, total: 5, submitted_at: '2026-09-11T14:20:00Z' },
  ],
  vault: { due: 2 },
  weakest_unit: 'Electrostatics',
};

/** Lane A's route, as far as this card can tell: 400 without a uuid exam. */
function laneAFetch(url: string) {
  const u = new URL(String(url), 'https://jkkn.ai');
  const exam = u.searchParams.get('exam') ?? '';
  if (!UUID_RE.test(exam)) {
    return new Response(JSON.stringify({ error: 'exam must be a uuid' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ report: REPORT }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => laneAFetch(url)));
});

const calls = () => (globalThis.fetch as any).mock.calls.map((c: any[]) => String(c[0]));

describe('ProgressCard ↔ learner-report API contract', () => {
  it('asks for the subject report with ?exam=<uuid>, so the card actually renders', async () => {
    render(<ProgressCard learnerId={LEARNER_ID} subjects={SUBJECTS} />);
    await screen.findByText('My progress');

    const urls = calls();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(
      `/api/foundation/onemark/results/learner/${LEARNER_ID}?exam=${PHYSICS_EXAM}`,
    );
    expect(screen.getByText('2 of 5 last time')).toBeInTheDocument();
    expect(screen.getByText('Electrostatics')).toBeInTheDocument();
  });

  it('renders nothing when the API refuses the request (the #3431 symptom, kept honest)', async () => {
    // A card that somehow asked without an exam must still degrade to nothing.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => laneAFetch(`/api/foundation/onemark/results/learner/${LEARNER_ID}`)),
    );
    const { container } = render(<ProgressCard learnerId={LEARNER_ID} subjects={SUBJECTS} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('never calls the API when the learner has no subjects', () => {
    const { container } = render(<ProgressCard learnerId={LEARNER_ID} subjects={[]} />);
    expect(calls()).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });

  it('re-asks for the chosen subject from the picker', async () => {
    render(<ProgressCard learnerId={LEARNER_ID} subjects={SUBJECTS} />);
    await screen.findByText('My progress');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await screen.findByText('My progress');
    expect(calls().at(-1)).toBe(
      `/api/foundation/onemark/results/learner/${LEARNER_ID}?exam=${ENGLISH_EXAM}`,
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the first subject the learner can sit, not merely the first listed', () => {
    expect(
      defaultProgressSubject([
        { examDefinitionId: ENGLISH_EXAM, name: 'English', poolReady: false, questionCount: 0 },
        ...SUBJECTS,
      ])?.examDefinitionId,
    ).toBe(PHYSICS_EXAM);
    expect(defaultProgressSubject([])).toBeNull();
  });
});
