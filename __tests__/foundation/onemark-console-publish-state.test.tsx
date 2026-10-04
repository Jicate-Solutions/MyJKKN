// @vitest-environment jsdom
//
// BUG-006063 PBUG-25 (also BUG-006062): the Foundation console still listed an
// unpublished OneMark paper exactly like a live one. Unpublish keeps the
// cohort on purpose, so the console must say which state the paper is in —
// and a publish / unpublish in the paper builder must reach the console's
// cached list at once.
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let assessments: unknown[] = [];

vi.mock('@/hooks/foundation/use-foundation', async (orig) => ({
  ...(await orig<typeof import('@/hooks/foundation/use-foundation')>()),
  useCohorts: () => ({
    data: [
      {
        id: 'c1',
        exam_definition_id: 'exam-1',
        resource_person_id: 'u1',
        is_active: true,
        exam_definition: { id: 'exam-1', config_key: 'tn_hsc_physics', display_name: 'Physics' },
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useAssessments: () => ({ data: assessments, isLoading: false }),
  useRoster: () => ({ data: [], isLoading: false }),
  useSetCohortResourcePerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ canAccess: () => true }) }));
vi.mock('@/hooks/use-auth-provider', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(routes)/foundation/_components/item-author-dialog', () => ({ ItemAuthorDialog: () => null }));
vi.mock('@/app/(routes)/foundation/_components/assessment-builder-dialog', () => ({ AssessmentBuilderDialog: () => null }));
vi.mock('@/app/(routes)/foundation/_components/item-review-panel', () => ({ ItemReviewPanel: () => null }));
vi.mock('@/app/(routes)/foundation/_components/enroll-learner-dialog', () => ({ EnrollLearnerDialog: () => null }));

const act_ = vi.fn();
vi.mock('@/lib/services/onemark/paper-service', async (orig) => {
  const real = await orig<typeof import('@/lib/services/onemark/paper-service')>();
  return { ...real, PaperService: { ...real.PaperService, act: (...a: unknown[]) => act_(...a) } };
});

import { CohortConsole } from '@/app/(routes)/foundation/_components/cohort-console';
import { usePaperAction } from '@/hooks/onemark/use-paper';

const paper = (id: string, title: string, config: unknown) => ({
  id,
  exam_definition_id: 'exam-1',
  cohort_id: 'c1',
  title,
  kind: 'mock',
  config,
  is_active: true,
  item_count: 15,
});

afterEach(() => cleanup());

describe('Console — a OneMark paper shows whether it is published', () => {
  it('labels an unpublished paper "Not published", a live one "Published", and leaves other assessments alone', () => {
    assessments = [
      paper('a1', 'Withdrawn paper', { onemark: true, state: 'FINALIZED', open_at: '2026-09-08T00:00:00Z', outputs: {} }),
      paper('a2', 'Live paper', { onemark: true, state: 'FINALIZED', outputs: { published_at: '2026-09-08T00:00:00Z' } }),
      { ...paper('a3', 'Hand-built set', {}), kind: 'practice' },
    ];
    render(<CohortConsole />);
    const withdrawn = screen.getByText('Withdrawn paper').parentElement!;
    const live = screen.getByText('Live paper').parentElement!;
    const plain = screen.getByText('Hand-built set').parentElement!;
    expect(withdrawn).toHaveTextContent('Not published');
    expect(live).toHaveTextContent('Published');
    expect(live).not.toHaveTextContent('Not published');
    expect(plain).not.toHaveTextContent(/published/i);
  });
});

describe('Paper builder — its actions refresh the console list', () => {
  it('invalidates the Foundation assessments lists after an action succeeds', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    act_.mockResolvedValue({ paper: { id: 'p1' } });
    const { result } = renderHook(() => usePaperAction('p1'), {
      wrapper: (p: any) => <QueryClientProvider client={qc}>{p.children}</QueryClientProvider>,
    });
    await act(async () => {
      await result.current.mutateAsync({ action: 'unpublish' });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['foundation', 'assessments'] });
  });
});
