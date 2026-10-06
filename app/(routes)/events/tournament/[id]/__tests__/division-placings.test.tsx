// @vitest-environment jsdom
// BUG-006252 (option b): BALAM-2K26 played day 1 before any fixtures were drawn,
// so no match row can carry those results. An organiser records each division's
// winner, runner-up and third place directly; the public results page,
// certificates and medals already read tournament_entries.final_rank.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const mutateAsync = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/hooks/events/use-tournament-registrations', () => ({
  useRecordPlacings: () => ({ mutateAsync, isPending: false }),
}));

import { DivisionPlacings, placingChanges } from '../_components/division-placings';

const entry = (id: string, name: string, final_rank: number | null = null, status = 'confirmed') =>
  ({ id, entry_name: name, institution_name: 'JKKN', final_rank, status }) as any;

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

describe('placingChanges', () => {
  it('sets the picked ranks and clears a rank that was moved off an entry', () => {
    const entries = [entry('a', 'AHS', 1), entry('b', 'Dental'), entry('c', 'Arts')];
    expect(placingChanges(entries, { 1: 'b', 2: 'a' })).toEqual([
      { entryId: 'a', final_rank: 2 },
      { entryId: 'b', final_rank: 1 },
    ]);
  });

  it('changes nothing when the picks match what is saved', () => {
    const entries = [entry('a', 'AHS', 1), entry('b', 'Dental', 2)];
    expect(placingChanges(entries, { 1: 'a', 2: 'b' })).toEqual([]);
  });
});

describe('DivisionPlacings', () => {
  it('lets an organiser record winner and runner-up for a division with no matches', async () => {
    render(
      <DivisionPlacings eventId="ev-1" entries={[entry('a', 'AHS'), entry('b', 'Dental')]} canManage />,
    );
    expect(screen.getByText('No winners recorded yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    fireEvent.change(screen.getByLabelText(/Winner/), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText(/Runner-up/), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith([
      { entryId: 'a', final_rank: 2 },
      { entryId: 'b', final_rank: 1 },
    ]);
  });

  it('refuses the same entry in two places', () => {
    render(
      <DivisionPlacings eventId="ev-1" entries={[entry('a', 'AHS'), entry('b', 'Dental')]} canManage />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    fireEvent.change(screen.getByLabelText(/Winner/), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText(/Runner-up/), { target: { value: 'a' } });
    expect(screen.getByRole('alert').textContent).toMatch(/two places/);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows saved winners read-only, without the button, for a viewer', () => {
    render(<DivisionPlacings eventId="ev-1" entries={[entry('a', 'AHS', 1), entry('b', 'Dental', 2)]} />);
    expect(screen.getByText(/🥇 AHS/)).toBeTruthy();
    expect(screen.getByText(/🥈 Dental/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Record winners/ })).toBeNull();
  });

  it('leaves withdrawn entries out of the choices', () => {
    render(
      <DivisionPlacings
        eventId="ev-1"
        entries={[entry('a', 'AHS'), entry('w', 'Gone', null, 'withdrawn')]}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    const opts = Array.from((screen.getByLabelText(/Winner/) as HTMLSelectElement).options).map((o) => o.value);
    expect(opts).toEqual(['', 'a']);
  });
});
