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

import { DivisionPlacings, placingChanges, currentPicks } from '../_components/division-placings';

const entry = (id: string, name: string, final_rank: number | null = null, status = 'confirmed') =>
  ({ id, entry_name: name, institution_name: 'JKKN', final_rank, status }) as any;

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

describe('placingChanges — only the places the organiser changed', () => {
  it('a Save with nothing changed writes nothing, even with two bronzes and a 5th place', () => {
    // fn_award_achievements gives BOTH knockout semi-final losers rank 3.
    const entries = [entry('a', 'A', 1), entry('b', 'B', 2), entry('c', 'C', 3), entry('d', 'D', 3), entry('e', 'E', 5)];
    const before = currentPicks(entries);
    expect(placingChanges(entries, before, { ...before })).toEqual([]);
  });

  it('changing the winner leaves both bronzes and the 5th place alone', () => {
    const entries = [entry('a', 'A', 1), entry('b', 'B'), entry('c', 'C', 3), entry('d', 'D', 3), entry('e', 'E', 5)];
    const before = currentPicks(entries);
    expect(placingChanges(entries, before, { ...before, 1: 'b' })).toEqual([
      { entryId: 'a', final_rank: null },
      { entryId: 'b', final_rank: 1 },
    ]);
  });

  it('a withdrawn winner is cleared when a new winner is picked (never two golds)', () => {
    const entries = [entry('w', 'Gone', 1, 'withdrawn'), entry('b', 'B')];
    const before = currentPicks(entries);
    expect(before[1]).toBe('w');
    expect(placingChanges(entries, before, { ...before, 1: 'b' })).toEqual([
      { entryId: 'w', final_rank: null },
      { entryId: 'b', final_rank: 1 },
    ]);
  });

  it('changing third place clears every entry holding it', () => {
    const entries = [entry('c', 'C', 3), entry('d', 'D', 3), entry('f', 'F')];
    const before = currentPicks(entries);
    expect(placingChanges(entries, before, { ...before, 3: 'f' })).toEqual([
      { entryId: 'c', final_rank: null },
      { entryId: 'd', final_rank: null },
      { entryId: 'f', final_rank: 3 },
    ]);
  });

  it('clears come before sets: no point in the write order has two entries on one place', () => {
    const entries = [entry('a', 'A', 1), entry('b', 'B', 2), entry('c', 'C')];
    const before = currentPicks(entries);
    // swap winner and runner-up, and give third to C
    const changes = placingChanges(entries, before, { 1: 'b', 2: 'a', 3: 'c' });
    const state = new Map(entries.map((e: any) => [e.id, e.final_rank]));
    for (const c of changes) {
      state.set(c.entryId, c.final_rank);
      const held = [...state.values()].filter((r) => r != null);
      expect(new Set(held).size).toBe(held.length);
    }
    expect(Object.fromEntries(state)).toEqual({ a: 2, b: 1, c: 3 });
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
      { entryId: 'b', final_rank: 1 },
      { entryId: 'a', final_rank: 2 },
    ]);
  });

  it('a plain Save on a division with two bronzes sends nothing', async () => {
    render(
      <DivisionPlacings
        eventId="ev-1"
        entries={[entry('a', 'A', 1), entry('b', 'B', 2), entry('c', 'C', 3), entry('d', 'D', 3)]}
        canManage
      />,
    );
    expect(screen.getByText(/🥉 C/)).toBeTruthy();
    expect(screen.getByText(/🥉 D/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    expect(screen.getByText(/2 entries share this place/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
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

  it('offers a withdrawn entry only while it still holds a place', () => {
    render(
      <DivisionPlacings
        eventId="ev-1"
        entries={[entry('a', 'AHS'), entry('w', 'Gone', 1, 'withdrawn'), entry('x', 'Out', null, 'withdrawn')]}
        canManage
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    const sel = screen.getByLabelText(/Winner/) as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', 'a', 'w']);
    expect(sel.value).toBe('w');
    expect(sel.options[2].textContent).toMatch(/withdrawn/);
  });
});
