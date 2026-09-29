// @vitest-environment jsdom
// =====================================================================
// HR appraisals — the head of department's team board
// =====================================================================
// Two faults found on the board:
//  1. Opening a draft, or an appraisal already passed to the committee,
//     from "Other appraisals" still offered "Submit to SEDC"; a click came
//     back as the raw "Invalid review status transition" error. The
//     controls now show only for a self_submitted appraisal in an open
//     round; everything else opens read-only with a line saying where it is.
//  2. The person showed as an 8-character id and the self-appraisal as raw
//     JSON. The board now shows names (falling back to "Team member") and
//     the self-appraisal in words.
// The service is mocked, so these prove the SCREEN.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  listCycles: vi.fn(),
  pickOpenCycle: vi.fn(),
  listTeamReviews: vi.fn(),
  listPeople: vi.fn(),
  getPolicyForStaff: vi.fn(),
  submitSupervisorReview: vi.fn(),
  sendBack: vi.fn(),
}));
const toastFns = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/services/hr/performance-review-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/hr/performance-review-service')>(
    '@/lib/services/hr/performance-review-service',
  );
  return { ...actual, PerformanceReviewService: svc };
});
vi.mock('react-hot-toast', () => ({ default: toastFns }));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: (props: { children: React.ReactNode }) => props.children,
}));
vi.mock('@/lib/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: { institution_id: 'inst-1' }, error: null });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'head-profile' } } }) },
    from: () => chain,
  };
  return { createClientSupabaseClient: () => client };
});

import HrSupervisorTeamReviewPage from '@/app/(routes)/hr/performance-reviews/team/page';
import {
  HEAD_STEP_NOTES,
  HEAD_STEP_TITLES,
  MOVED_ON_MESSAGE,
  headStep,
  isMovedOnError,
  personName,
} from '@/lib/hr/appraisal-team-board';
import type { HRPerformanceReview, ReviewStatus } from '@/lib/services/hr/performance-review-service';

// The page gets the mock; the name lookup itself is tested on the real service.
const { PerformanceReviewService: RealService } = await vi.importActual<
  typeof import('@/lib/services/hr/performance-review-service')
>('@/lib/services/hr/performance-review-service');

function appraisal(id: string, status: ReviewStatus, over: Partial<HRPerformanceReview> = {}): HRPerformanceReview {
  return {
    id,
    cycle_id: 'cyc-1',
    staff_id: `person-${id}-0000-0000`,
    self_appraisal_jsonb: {
      achievements: `Achievements of ${id}`,
      goals_next_year: 'Finish the thesis.',
      ratings: { teaching: 'exceeds', research: 'meets', service: 'meets', collegiality: 'meets' },
    },
    supervisor_review_jsonb: null,
    sedc_review_jsonb: null,
    final_score: null,
    final_remarks: null,
    status,
    self_submitted_at: status === 'draft' ? null : '2026-09-10T00:00:00Z',
    supervisor_reviewed_at: null,
    sedc_reviewed_at: null,
    final_approved_at: null,
    final_approved_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

const WAITING = appraisal('a', 'self_submitted');
const DRAFT = appraisal('b', 'draft');
const REVIEWED = appraisal('c', 'supervisor_reviewed', {
  supervisor_review_jsonb: {
    ratings: { teaching: 'meets', research: 'meets', service: 'exceeds', collegiality: 'meets' },
    validation_notes: 'Evidence checked against the register.',
    recommendations: '',
  },
});
const WITH_DIRECTOR = appraisal('d', 'sedc_reviewed');
const CLOSED = appraisal('e', 'final_approved');

function setup(roundStatus: 'open' | 'locked', rows: HRPerformanceReview[], names = true) {
  const round = { id: 'cyc-1', cycle_year: 2027, status: roundStatus };
  svc.listCycles.mockResolvedValue([round]);
  svc.pickOpenCycle.mockReturnValue(roundStatus === 'open' ? round : null);
  svc.listTeamReviews.mockResolvedValue(rows);
  svc.listPeople.mockResolvedValue(
    names
      ? {
          [WAITING.staff_id]: { name: 'Anitha Raman', department: 'Physics' },
          [DRAFT.staff_id]: { name: 'Bala Kumar', department: 'Physics' },
          [REVIEWED.staff_id]: { name: 'Chitra Devi', department: null },
          [WITH_DIRECTOR.staff_id]: { name: 'Dinesh S', department: null },
          [CLOSED.staff_id]: { name: 'Elango M', department: null },
        }
      : {},
  );
  svc.getPolicyForStaff.mockResolvedValue(null);
  render(<HrSupervisorTeamReviewPage />);
}

async function openRow(name: string) {
  const cell = await screen.findByText(name);
  const row = cell.closest('tr') as HTMLElement;
  fireEvent.click(within(row).getByRole('button'));
}

const ACTIONS = [/Submit to SEDC/, /Send back to the person/];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('which appraisals the head may act on', () => {
  it('only a self_submitted appraisal in an open round', () => {
    expect(headStep('self_submitted', 'open')).toEqual({ canReview: true, note: null, title: null });
    expect(headStep('self_submitted', 'locked')).toEqual({
      canReview: false,
      note: HEAD_STEP_NOTES.lockedRound,
      title: 'This round is locked',
    });
    for (const s of ['draft', 'supervisor_reviewed', 'sedc_reviewed', 'final_approved'] as const) {
      for (const r of ['open', 'locked']) {
        const step = headStep(s, r);
        expect(step.canReview).toBe(false);
        expect(step.note).toBe(HEAD_STEP_NOTES[s]);
        expect(step.title).toBe(HEAD_STEP_TITLES[s]);
        // The heading never repeats the line under it.
        expect(step.note?.startsWith(step.title ?? '#')).toBe(false);
      }
    }
  });

  it('recognises the service refusals that mean the appraisal moved on', () => {
    expect(isMovedOnError(new Error('Invalid review status transition: draft → supervisor_reviewed.'))).toBe(true);
    expect(isMovedOnError(new Error('A send-back must go one step back. From draft …'))).toBe(true);
    expect(isMovedOnError(new Error('permission denied'))).toBe(false);
  });

  it('falls back to "Team member" when no name can be read', () => {
    expect(personName({}, 'x')).toBe('Team member');
    expect(personName({ x: { name: null, department: 'Physics' } }, 'x')).toBe('Team member');
    expect(personName({ x: { name: 'Anitha Raman', department: null } }, 'x')).toBe('Anitha Raman');
  });
});

describe('the board, as the head of department sees it', () => {
  it('lists people by name and department, and labels the row button by what it allows', async () => {
    setup('open', [WAITING, DRAFT, REVIEWED]);
    const waitingRow = (await screen.findByText('Anitha Raman')).closest('tr') as HTMLElement;
    expect(within(waitingRow).getByText('Physics')).toBeInTheDocument();
    expect(within(waitingRow).getByRole('button')).toHaveTextContent('Review');
    const draftRow = screen.getByText('Bala Kumar').closest('tr') as HTMLElement;
    expect(within(draftRow).getByRole('button')).toHaveTextContent('View');
    expect(within(draftRow).getByText('Still a draft')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/person-a-00…/);
    expect(svc.listPeople).toHaveBeenCalledWith(expect.anything(), [
      WAITING.staff_id, DRAFT.staff_id, REVIEWED.staff_id,
    ]);
  });

  it('shows "Team member" and a short reference when names cannot be read', async () => {
    setup('open', [WAITING, DRAFT], false);
    // The column heading is also "Team member"; count the rows.
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td div')?.textContent),
      ).toEqual(['Team member', 'Team member']),
    );
    expect(screen.getByText('ref person-a')).toBeInTheDocument();
    expect(screen.getByText('ref person-b')).toBeInTheDocument();
  });

  it('a waiting appraisal in an open round: both actions offered, self-appraisal in words', async () => {
    setup('open', [WAITING]);
    await openRow('Anitha Raman');
    for (const a of ACTIONS) expect(screen.getByRole('button', { name: a })).toBeEnabled();
    expect(screen.getByText('Achievements of a')).toBeInTheDocument();
    expect(screen.getByText('Goals for next year')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('"achievements"');
    expect(screen.queryByText(HEAD_STEP_NOTES.lockedRound)).not.toBeInTheDocument();
  });

  it.each([
    ['a draft', DRAFT, 'Bala Kumar', HEAD_STEP_NOTES.draft],
    ['one already reviewed', REVIEWED, 'Chitra Devi', HEAD_STEP_NOTES.supervisor_reviewed],
    ['one with the Director', WITH_DIRECTOR, 'Dinesh S', HEAD_STEP_NOTES.sedc_reviewed],
    ['one signed off', CLOSED, 'Elango M', HEAD_STEP_NOTES.final_approved],
  ])('%s opens read-only, says where it is, and offers no action', async (_l, row, name, note) => {
    setup('open', [WAITING, row]);
    await openRow(name);
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.queryAllByText(/^Still a draft/)).toHaveLength(row === DRAFT ? 1 : 0);
    for (const a of ACTIONS) expect(screen.queryByRole('button', { name: a })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Validation notes')).not.toBeInTheDocument();
    expect(svc.submitSupervisorReview).not.toHaveBeenCalled();
    expect(svc.sendBack).not.toHaveBeenCalled();
  });

  it('an appraisal already reviewed shows the head their own review, read-only', async () => {
    setup('open', [REVIEWED]);
    await openRow('Chitra Devi');
    expect(screen.getByText('Evidence checked against the register.')).toBeInTheDocument();
    expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
  });

  it('a draft the head sent back shows the note they left', async () => {
    const sentBack = appraisal('b', 'draft', {
      supervisor_review_jsonb: { sent_back_reason: 'Add the March evidence.', sent_back_by: 'head' },
    });
    setup('open', [sentBack]);
    await openRow('Bala Kumar');
    expect(screen.getByText('You sent this back to the person')).toBeInTheDocument();
    expect(screen.getByText('Add the March evidence.')).toBeInTheDocument();
  });

  it('a waiting appraisal in a locked round opens read-only with the reason', async () => {
    setup('locked', [WAITING]);
    await openRow('Anitha Raman');
    expect(screen.getByText('This round is locked')).toBeInTheDocument();
    expect(screen.getByText(HEAD_STEP_NOTES.lockedRound)).toBeInTheDocument();
    for (const a of ACTIONS) expect(screen.queryByRole('button', { name: a })).not.toBeInTheDocument();
  });

  it('if the appraisal moved on underneath the board, says so instead of the raw refusal', async () => {
    setup('open', [WAITING]);
    await openRow('Anitha Raman');
    svc.sendBack.mockRejectedValueOnce(
      new Error('A send-back must go one step back. From supervisor_reviewed that is self_submitted, not draft.'),
    );
    fireEvent.change(screen.getByLabelText('What should they change?'), {
      target: { value: 'Add dates.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send back to the person/ }));
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith(MOVED_ON_MESSAGE));
    for (const [msg] of toastFns.error.mock.calls) {
      expect(String(msg)).not.toMatch(/Invalid review status transition|one step back/);
    }
    // Back on the board, reloaded.
    await waitFor(() => expect(svc.listTeamReviews).toHaveBeenCalledTimes(2));
  });
});

describe('reading names', () => {
  function fakeClient(opts: { staffError?: boolean; deptThrows?: boolean }) {
    const calls: Array<{ table: string; cols: string; ids: string[] }> = [];
    const from = (table: string) => {
      let cols = '';
      const b: Record<string, unknown> = {
        select: (c: string) => { cols = c; return b; },
        in: async (_k: string, ids: string[]) => {
          calls.push({ table, cols, ids });
          if (table === 'staff') {
            if (opts.staffError) return { data: null, error: { message: 'denied' } };
            return {
              data: [
                { id: 's1', first_name: 'Anitha', last_name: 'Raman', department_id: 'd1' },
                { id: 's2', first_name: '', last_name: null, department_id: null },
              ],
              error: null,
            };
          }
          if (opts.deptThrows) throw new Error('no access');
          return { data: [{ id: 'd1', department_name: 'Physics' }], error: null };
        },
      };
      return b;
    };
    return { client: { from } as never, calls };
  }

  it('joins first and last name, adds the department, and reads only what it needs', async () => {
    const { client, calls } = fakeClient({});
    const out = await RealService.listPeople(client, ['s1', 's2', 's1', '']);
    expect(out).toEqual({
      s1: { name: 'Anitha Raman', department: 'Physics' },
      s2: { name: null, department: null },
    });
    expect(calls).toEqual([
      { table: 'staff', cols: 'id, first_name, last_name, department_id', ids: ['s1', 's2'] },
      { table: 'departments', cols: 'id, department_name', ids: ['d1'] },
    ]);
  });

  it('returns nothing, without throwing, when the people cannot be read', async () => {
    const { client } = fakeClient({ staffError: true });
    await expect(RealService.listPeople(client, ['s1'])).resolves.toEqual({});
  });

  it('keeps the names when the departments cannot be read', async () => {
    const { client } = fakeClient({ deptThrows: true });
    const out = await RealService.listPeople(client, ['s1']);
    expect(out.s1).toEqual({ name: 'Anitha Raman', department: null });
  });

  it('reads nothing for an empty board', async () => {
    const { client, calls } = fakeClient({});
    await expect(RealService.listPeople(client, [])).resolves.toEqual({});
    expect(calls).toEqual([]);
  });
});
