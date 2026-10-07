// @vitest-environment jsdom
/**
 * The "How this is done" card and the /hr/playbooks page (20271007161139):
 * every line names who wrote it, the Suggest dialog says it is credited to the
 * team member by name, and the Proposals tab exists only for the manage key.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlaybookLine } from '@/types/hr-playbook';

const state = vi.hoisted(() => ({
  lines: [] as unknown[],
  perms: {} as Record<string, boolean>,
  superAdmin: false,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('duty=L1'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/hr/use-duty-playbooks', () => ({
  useDutyPlaybook: () => ({ data: state.lines, isLoading: false, error: null }),
  usePlaybookProposals: () => ({ data: [], isLoading: false, error: null }),
  usePlaybookContributors: () => ({ data: [], isLoading: false, error: null }),
  useSuggestPlaybookLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDecidePlaybookProposal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetirePlaybookLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: (k: string) => Boolean(state.perms[k]),
    isSuperAdmin: state.superAdmin,
    userProfile: { id: 'me' },
    isLoading: false,
  }),
}));
vi.mock('@/components/auth/permission-guard', () => ({
  PermissionGuard: (p: { children: React.ReactNode }) => p.children,
}));

import { DutyPlaybookCard } from '@/components/hr/duty-playbook/duty-playbook-card';
import { PlaybooksView } from '@/app/(routes)/hr/playbooks/_components/playbooks-view';

const line = (over: Partial<PlaybookLine>): PlaybookLine => ({
  id: 'l1', duty_code: 'L1', line_text: 'Open the attached certificate before deciding.', line_position: 1,
  source: 'suggestion', authored_by: 'a', author_name: 'Anil Kumar', lesson_count: null,
  accepted_by: 'z', accepted_by_name: 'Zara Begum', accepted_at: '2026-10-07T00:00:00Z',
  edited_by: null, edited_by_name: null, ...over,
});

afterEach(() => {
  cleanup();
  state.lines = [];
  state.perms = {};
  state.superAdmin = false;
});

function openCard() {
  render(<DutyPlaybookCard duty='L1' />);
  fireEvent.click(screen.getByRole('button', { name: /How this is done/ }));
}

describe('DutyPlaybookCard', () => {
  it('credits a written line to the team member who wrote it', () => {
    state.lines = [line({})];
    openCard();
    expect(screen.getByText('Open the attached certificate before deciding.')).toBeInTheDocument();
    expect(screen.getByText('Written by Anil Kumar')).toBeInTheDocument();
  });

  it('a suggestion the decider reworded names both: suggested by one, edited by the other', () => {
    state.lines = [line({ edited_by: 'z', edited_by_name: 'Zara Begum' })];
    openCard();
    expect(screen.getByText('Suggested by Anil Kumar · edited by Zara Begum')).toBeInTheDocument();
    expect(screen.queryByText('Written by Anil Kumar')).not.toBeInTheDocument();
  });

  it('a line learned from reasons says how many and who accepted it', () => {
    state.lines = [line({ id: 'l2', source: 'lesson_pattern', lesson_count: 4, author_name: 'Zara Begum' })];
    openCard();
    expect(screen.getByText('Learned from 4 reasons · accepted by Zara Begum')).toBeInTheDocument();
  });

  it('shows the empty state and links to the playbooks page for this duty', () => {
    openCard();
    expect(screen.getByText('No playbook yet. Suggest the first line.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All playbooks/ })).toHaveAttribute('href', '/hr/playbooks?duty=L1');
  });

  it('shows at most 8 lines', () => {
    state.lines = Array.from({ length: 10 }, (_, i) => line({ id: `l${i}`, line_text: `Step number ${i} of the duty.` }));
    openCard();
    expect(screen.getAllByText(/^Step number \d of the duty\.$/)).toHaveLength(8);
    expect(screen.getByText('2 more lines on the playbooks page.')).toBeInTheDocument();
  });

  it('Suggest a line tells the team member it is credited to them by name', () => {
    openCard();
    fireEvent.click(screen.getByRole('button', { name: /Suggest a line/ }));
    expect(screen.getByText(/This will be credited to you by name/)).toBeInTheDocument();
  });
});

describe('/hr/playbooks tabs', () => {
  it('hides the Proposals tab from a team member without the manage key', () => {
    render(<PlaybooksView />);
    expect(screen.getByRole('tab', { name: 'Playbooks by duty' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Contributors' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Proposals' })).not.toBeInTheDocument();
  });

  it('shows the Proposals tab to whoever holds hr.harness.playbooks.manage', () => {
    state.perms = { 'hr.harness.playbooks.manage': true };
    render(<PlaybooksView />);
    expect(screen.getByRole('tab', { name: 'Proposals' })).toBeInTheDocument();
  });

  it('shows the Proposals tab to a super admin', () => {
    state.superAdmin = true;
    render(<PlaybooksView />);
    expect(screen.getByRole('tab', { name: 'Proposals' })).toBeInTheDocument();
  });
});
