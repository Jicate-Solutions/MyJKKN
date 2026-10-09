// @vitest-environment jsdom
// BUG-006273 (COO, 9 Oct): cultural events get the same Winner / Runner-up
// provision as sports tournaments (#4222). An organiser records 1st, 2nd and 3rd
// place on the event's registrations; everyone else sees what was recorded.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const mutateAsync = vi.hoisted(() => vi.fn(async () => undefined));
const winners = vi.hoisted(() => ({ data: undefined as any }));
vi.mock('@/hooks/events/use-event-winners', () => ({
  useEventWinners: () => ({ data: winners.data }),
  useRecordEventWinners: () => ({ mutateAsync, isPending: false }),
}));

import { EventWinnersCard, winnerChanges, currentPicks } from '@/components/events/shared/event-winners-card';

const reg = (id: string, name: string, final_rank: number | null = null, extra: Record<string, unknown> = {}) =>
  ({ id, participant_name: name, institution_name: 'JKKN', department: null, status: 'registered', form_id: null, final_rank, ...extra }) as any;

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
  winners.data = undefined;
});

describe('winnerChanges — only the places the organiser changed', () => {
  it('a Save with nothing changed writes nothing', () => {
    const regs = [reg('a', 'A', 1), reg('b', 'B', 2), reg('c', 'C')];
    const before = currentPicks(regs);
    expect(winnerChanges(regs, before, { ...before })).toEqual([]);
  });

  it('a swap of winner and runner-up clears both before setting either', () => {
    const regs = [reg('a', 'A', 1), reg('b', 'B', 2), reg('c', 'C')];
    const before = currentPicks(regs);
    const changes = winnerChanges(regs, before, { 1: 'b', 2: 'a', 3: 'c' });
    const state = new Map(regs.map((r: any) => [r.id, r.final_rank]));
    for (const c of changes) {
      state.set(c.registrationId, c.final_rank);
      const held = [...state.values()].filter((r) => r != null);
      expect(new Set(held).size).toBe(held.length);
    }
    expect(Object.fromEntries(state)).toEqual({ a: 2, b: 1, c: 3 });
  });

  it('removing the runner-up clears only that place', () => {
    const regs = [reg('a', 'A', 1), reg('b', 'B', 2)];
    const before = currentPicks(regs);
    expect(winnerChanges(regs, before, { ...before, 2: '' })).toEqual([{ registrationId: 'b', final_rank: null }]);
  });
});

describe('EventWinnersCard', () => {
  it('lets an organiser record the 1st and 2nd place of a cultural event', async () => {
    winners.data = { canManage: true, forms: [], registrations: [reg('a', 'Kavya'), reg('b', 'Arun')] };
    render(<EventWinnersCard eventId="ev-1" />);
    expect(screen.getByText('Winners')).toBeTruthy();
    expect(screen.getByText('No winners recorded yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    fireEvent.change(screen.getByLabelText(/Winner/), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText(/Runner-up/), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith([
      { registrationId: 'b', final_rank: 1 },
      { registrationId: 'a', final_rank: 2 },
    ]);
  });

  it('refuses the same person in two places', () => {
    winners.data = { canManage: true, forms: [], registrations: [reg('a', 'Kavya'), reg('b', 'Arun')] };
    render(<EventWinnersCard eventId="ev-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    fireEvent.change(screen.getByLabelText(/Winner/), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText(/Runner-up/), { target: { value: 'a' } });
    expect(screen.getByRole('alert').textContent).toMatch(/two places/);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows recorded winners read-only, without the button, to a viewer', () => {
    winners.data = { canManage: false, forms: [], registrations: [reg('a', 'Kavya', 1), reg('b', 'Arun', 2)] };
    render(<EventWinnersCard eventId="ev-1" />);
    expect(screen.getByText(/🥇 Winner: Kavya/)).toBeTruthy();
    expect(screen.getByText(/🥈 Runner-up: Arun/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Record winners/ })).toBeNull();
  });

  it('renders nothing for a viewer when no winners are recorded', () => {
    winners.data = { canManage: false, forms: [], registrations: [] };
    const { container } = render(<EventWinnersCard eventId="ev-1" />);
    expect(container.innerHTML).toBe('');
  });

  it('keeps a separate set of places for each competition (registration form)', () => {
    winners.data = {
      canManage: true,
      splitByForm: true,
      forms: [
        { id: 'f1', name: 'Solo dance' },
        { id: 'f2', name: 'Group song' },
      ],
      registrations: [reg('a', 'Kavya', 1, { form_id: 'f1' }), reg('b', 'Arun', 1, { form_id: 'f2' })],
    };
    render(<EventWinnersCard eventId="ev-1" />);
    expect(screen.getAllByTestId('event-winners-group')).toHaveLength(2);
    expect(screen.getByText('Solo dance')).toBeTruthy();
    expect(screen.getByText('Group song')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Record winners/ })).toHaveLength(2);
  });

  it('one set for the whole event when the server says registrations sit on one form', () => {
    winners.data = {
      canManage: false,
      splitByForm: false,
      forms: [
        { id: 'f1', name: 'Solo dance' },
        { id: 'f2', name: 'Group song' },
      ],
      registrations: [reg('a', 'Kavya', 1, { form_id: 'f1' })],
    };
    render(<EventWinnersCard eventId="ev-1" />);
    expect(screen.getAllByTestId('event-winners-group')).toHaveLength(1);
    expect(screen.queryByText('Solo dance')).toBeNull();
  });

  it('moving the runner-up to winner refuses until runner-up is changed (no shared place, no double pick)', () => {
    winners.data = { canManage: true, forms: [], registrations: [reg('a', 'Kavya', 1), reg('b', 'Arun', 2)] };
    render(<EventWinnersCard eventId="ev-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Record winners/ }));
    fireEvent.change(screen.getByLabelText(/Winner/), { target: { value: 'b' } });
    expect(screen.getByRole('alert').textContent).toMatch(/two places/);
    fireEvent.change(screen.getByLabelText(/Runner-up/), { target: { value: 'a' } });
    expect(screen.queryByRole('alert')).toBeNull();
    // Each place is a single choice, so one place can never take two people.
    expect((screen.getByLabelText(/Winner/) as HTMLSelectElement).multiple).toBe(false);
  });
});
