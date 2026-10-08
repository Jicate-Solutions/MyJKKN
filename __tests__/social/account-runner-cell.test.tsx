// @vitest-environment jsdom
/**
 * "Runs this account" cell on the Instagram accounts list.
 * Everyone sees the name (or "Nobody named yet"); only a manager gets the
 * Name / Change control, which saves through setIgAccountRunner.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

const setIgAccountRunner = vi.fn();
vi.mock('@/services/instagram-service', () => ({
  setIgAccountRunner: (...args: unknown[]) => setIgAccountRunner(...args),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// The real picker searches the profiles directory; stand it in with a button
// that "picks" one team member, and record the props it was given.
const pickerProps: Array<Record<string, unknown>> = [];
vi.mock('@/components/cohort-core/member-picker', () => ({
  MemberPicker: (props: { onSelect: (m: unknown) => void; teamMembersOnly?: boolean }) => {
    pickerProps.push(props as unknown as Record<string, unknown>);
    return (
      <button
        type="button"
        onClick={() =>
          props.onSelect({
            id: 'p-1',
            full_name: 'Priya Raman',
            email: 'priya@jkkn.ac.in',
            role: 'faculty',
            avatar_url: null,
            institution_id: 'i-1',
          })
        }
      >
        pick Priya
      </button>
    );
  },
}));

import { AccountRunnerCell } from '@/app/(routes)/admission/social/instagram/_components/account-runner-cell';

afterEach(() => cleanup());
beforeEach(() => {
  setIgAccountRunner.mockReset();
  pickerProps.length = 0;
});

describe('AccountRunnerCell', () => {
  it('shows "Nobody named yet" and no control for a viewer without manage permission', () => {
    render(
      <AccountRunnerCell accountId="a-1" username="jkkn_pharmacy" runnerId={null} runnerName={null} canManage={false} />,
    );
    expect(screen.getByText('Nobody named yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /who runs/i })).not.toBeInTheDocument();
  });

  it("shows the named team member's name", () => {
    render(
      <AccountRunnerCell accountId="a-1" username="jkkn_pharmacy" runnerId="p-9" runnerName="Arun K" canManage={false} />,
    );
    expect(screen.getByText('Arun K')).toBeInTheDocument();
  });

  it('lets a manager pick a team member and save it', async () => {
    setIgAccountRunner.mockResolvedValue({ id: 'a-1', connected_by: 'p-1', connected_by_name: 'Priya Raman' });
    const onSaved = vi.fn();
    render(
      <AccountRunnerCell
        accountId="a-1"
        username="jkkn_pharmacy"
        runnerId={null}
        runnerName={null}
        canManage
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /name who runs @jkkn_pharmacy/i }));
    expect(await screen.findByText('Who runs @jkkn_pharmacy?')).toBeInTheDocument();
    // Learners are kept out of the search.
    expect(pickerProps.at(-1)?.teamMembersOnly).toBe(true);

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'pick Priya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(setIgAccountRunner).toHaveBeenCalledWith('a-1', 'p-1'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('lets a manager remove the name (sends null)', async () => {
    setIgAccountRunner.mockResolvedValue({ id: 'a-1', connected_by: null, connected_by_name: null });
    render(
      <AccountRunnerCell accountId="a-1" username="jkkn_pharmacy" runnerId="p-9" runnerName="Arun K" canManage />,
    );
    fireEvent.click(screen.getByRole('button', { name: /change who runs/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove name' }));
    await waitFor(() => expect(setIgAccountRunner).toHaveBeenCalledWith('a-1', null));
  });

  it("shows the server's refusal inside the dialog", async () => {
    setIgAccountRunner.mockRejectedValue(new Error('A learner cannot run an institution account. Pick a team member.'));
    render(
      <AccountRunnerCell accountId="a-1" username="jkkn_pharmacy" runnerId={null} runnerName={null} canManage />,
    );
    fireEvent.click(screen.getByRole('button', { name: /name who runs/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'pick Priya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot run an institution account/);
  });
});
