// @vitest-environment jsdom
// BUG-006255 / BUG-006253: on BALAM-2K26, 40 matches were set up and no result was
// entered, because "record result" was an icon-only trophy button whose label lived
// in a hover tooltip that phones never show. These tests pin visible text on the
// Result and Time buttons, and a Regenerate warning that counts the results it deletes.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const generateMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/events/use-tournament-fixtures', () => ({
  useGenerateFixtures: () => ({ mutate: generateMutate, isPending: false }),
  useScheduleMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRecordResult: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAwardAchievements: () => ({ mutate: vi.fn(), isPending: false }),
  useGenerateKnockoutFromPools: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('../_components/mobile-score-sheet', () => ({ MobileScoreSheet: () => null }));

import { DivisionFixtures } from '../_components/fixtures-section';

const base = {
  division_id: 'd-1',
  round_no: 1,
  round_label: 'Semi-final',
  scheduled_at: null,
  winner_entry_id: null,
};
const pending = { ...base, id: 'm1', status: 'pending', side_a_entry_id: 'a', side_b_entry_id: 'b', side_a_name: 'AHS', side_b_name: 'Dental' };
const done = { ...base, id: 'm2', status: 'completed', side_a_entry_id: 'c', side_b_entry_id: 'd', side_a_name: 'Arts', side_b_name: 'Nursing', winner_entry_id: 'c' };

function renderWith(matches: any[]) {
  return render(
    <DivisionFixtures eventId="ev-1" divisionId="d-1" matches={matches as any} entryCount={4} divisionFormat="knockout" canManage />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  generateMutate.mockReset();
});

describe('match row actions are labelled in text, not only a tooltip', () => {
  it('shows a visible "Result" on a match still to be played', () => {
    renderWith([pending]);
    const btn = screen.getByRole('button', { name: 'Record result' });
    expect(btn.textContent).toContain('Result');
  });

  it('shows a visible "Edit result" on a played match', () => {
    renderWith([done]);
    const btn = screen.getByRole('button', { name: 'Edit result' });
    expect(btn.textContent).toContain('Edit result');
  });

  it('shows a visible "Time" on the schedule button', () => {
    renderWith([pending]);
    const btn = screen.getByRole('button', { name: 'Schedule' });
    expect(btn.textContent).toContain('Time');
  });
});

describe('Regenerate says how many recorded results it deletes', () => {
  it('names the results that would be lost', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWith([pending, done]);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/including 1 result already recorded/);
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it('keeps the short warning when nothing has been played', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWith([pending]);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/ }));
    expect(confirm.mock.calls[0][0]).not.toMatch(/result/);
    expect(generateMutate).toHaveBeenCalledWith({ divisionId: 'd-1', regenerate: true });
  });
});
