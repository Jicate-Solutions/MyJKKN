// @vitest-environment jsdom

/**
 * How a closed meeting says it was closed (meeting detail page, and the
 * "Past meetings with this person" badges).
 *
 * 2 Oct 2026 — the daily sweep now closes a past meeting when its notes are
 * linked, stamped outcome_marked_by = 'notes' (migration 20271003091700). The
 * page must say exactly that, in plain words, and must never:
 *   - name a person (nobody acted — the profile id is NULL on these rows), or
 *   - claim the meeting was confirmed / happened (a linked note is a record,
 *     not a person's word).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// The undo (3 Oct 2026) renders MarkOutcomeButtons, a client component whose
// server action pulls in the whole scheduling import chain. None of that
// participates in WHETHER the buttons show, which is all these tests ask.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(routes)/meetings/[uid]/actions', () => ({ markMeetingOutcome: vi.fn() }));

import {
  OutcomeRecordedLine,
  outcomeRecordedText,
  canCorrectNotesClose,
} from '@/app/(routes)/meetings/[uid]/_components/outcome-recorded-line';
import { MarkOutcomeButtons } from '@/app/(routes)/meetings/[uid]/_components/mark-outcome-buttons';
import { PersonHistorySection } from '@/app/(routes)/meetings/[uid]/_components/person-history-section';
import { buildHistory } from '@/lib/services/meetings/meeting-person-history-service';

afterEach(cleanup);

const NOTES_LINE = "Closed automatically because the meeting's notes were linked.";

describe('the line under a closed meeting', () => {
  it("says 'closed automatically because the notes were linked' for the notes kind", () => {
    render(<OutcomeRecordedLine markedBy="notes" markedByName={null} />);
    expect(screen.getByText(NOTES_LINE)).toBeTruthy();
  });

  it('never names a person for the notes kind, even if a name were somehow supplied', () => {
    render(<OutcomeRecordedLine markedBy="notes" markedByName="Some Person" />);
    expect(screen.getByText(NOTES_LINE)).toBeTruthy();
    expect(screen.queryByText(/Some Person/)).toBeNull();
    expect(screen.queryByText(/Closed by/)).toBeNull();
  });

  it('never says confirmed or happened for the notes kind', () => {
    const text = outcomeRecordedText('notes', null) ?? '';
    expect(text).not.toMatch(/confirm/i);
    expect(text).not.toMatch(/happened/i);
  });

  it('uses design-system tokens, not fixed colours, so it reads in light and dark', () => {
    render(<OutcomeRecordedLine markedBy="notes" markedByName={null} />);
    const p = screen.getByText(NOTES_LINE);
    expect(p.className).toContain('text-muted-foreground');
  });

  it('keeps the other kinds exactly as they were', () => {
    expect(outcomeRecordedText('system', null)).toBe(
      'Closed automatically before 21 August 2026 — nobody confirmed it took place.',
    );
    expect(outcomeRecordedText('host', 'Ravi K')).toBe('Closed by Ravi K.');
    expect(outcomeRecordedText('admin', 'Ravi K')).toBe('Closed by Ravi K.');
    expect(outcomeRecordedText('host', null)).toBe('Recorded by the host.');
    expect(outcomeRecordedText('admin', null)).toBe('Recorded by an administrator.');
  });

  it('renders nothing for a meeting nobody has closed', () => {
    const { container } = render(<OutcomeRecordedLine markedBy={null} markedByName={null} />);
    expect(container.textContent).toBe('');
  });
});

describe('the earlier-meetings badge', () => {
  it('shows a notes-closed meeting as closed automatically, not as happened', () => {
    const history = buildHistory('A guest', [
      {
        uid: 'b-notes',
        start_time: '2026-09-01T05:00:00Z',
        status: 'completed',
        outcome_marked_by: 'notes',
        answers: null,
        meeting_type_id: null,
      },
    ]);
    render(<PersonHistorySection history={history} />);
    expect(screen.getByText('Closed automatically — notes linked')).toBeTruthy();
    expect(screen.queryByText('Happened')).toBeNull();
  });
});

describe('the undo on a notes-closed meeting (3 Oct 2026)', () => {
  const LEAD_IN = 'Wrong? You can still record what happened.';

  function buttons() {
    return {
      happened: screen.queryByRole('button', { name: /Mark happened/ }),
      noShow: screen.queryByRole('button', { name: /Mark no-show/ }),
    };
  }

  it('offers the host Mark happened / Mark no-show under the auto-closed line', () => {
    render(
      <OutcomeRecordedLine markedBy="notes" markedByName={null} status="completed" uid="bk-1" canAct />,
    );
    // The line still says auto-closed until a person acts.
    expect(screen.getByText(NOTES_LINE)).toBeTruthy();
    expect(screen.getByText(LEAD_IN)).toBeTruthy();
    expect(buttons().happened).toBeTruthy();
    expect(buttons().noShow).toBeTruthy();
    // Design-system token, so it reads in light and dark.
    expect(screen.getByText(LEAD_IN).className).toContain('text-muted-foreground');
  });

  it('shows nothing to correct for someone who is neither the host nor a super admin', () => {
    render(
      <OutcomeRecordedLine
        markedBy="notes"
        markedByName={null}
        status="completed"
        uid="bk-1"
        canAct={false}
      />,
    );
    expect(screen.getByText(NOTES_LINE)).toBeTruthy();
    expect(screen.queryByText(LEAD_IN)).toBeNull();
    expect(buttons().happened).toBeNull();
    expect(buttons().noShow).toBeNull();
  });

  it('offers no undo once a person has closed it, or for the retired sweep', () => {
    for (const markedBy of ['host', 'admin', 'system']) {
      cleanup();
      render(
        <OutcomeRecordedLine markedBy={markedBy} markedByName="Ravi K" status="completed" uid="bk-1" canAct />,
      );
      expect(screen.queryByText(LEAD_IN)).toBeNull();
      expect(buttons().happened).toBeNull();
    }
  });

  it('offers no undo on a notes-stamped row that is no longer completed', () => {
    render(<OutcomeRecordedLine markedBy="notes" markedByName={null} status="no_show" uid="bk-1" canAct />);
    expect(screen.queryByText(LEAD_IN)).toBeNull();
    expect(buttons().noShow).toBeNull();
  });

  it('canCorrectNotesClose accepts exactly a completed, notes-stamped row for a host or admin', () => {
    expect(canCorrectNotesClose('completed', 'notes', true)).toBe(true);
    expect(canCorrectNotesClose('completed', 'notes', false)).toBe(false);
    expect(canCorrectNotesClose('completed', 'system', true)).toBe(false);
    expect(canCorrectNotesClose('completed', 'host', true)).toBe(false);
    expect(canCorrectNotesClose('completed', null, true)).toBe(false);
    expect(canCorrectNotesClose('cancelled', 'notes', true)).toBe(false);
  });
});

describe('the "Mark happened" confirm dialog on a notes-closed meeting (3 Oct 2026)', () => {
  const NOTES_CLOSED_CONFIRM =
    'The booking is already Completed, closed automatically because its notes were linked. This records you as the person who confirmed it happened.';

  it('says it records the person as having confirmed it — not that the booking moves to Completed', () => {
    render(
      <OutcomeRecordedLine markedBy="notes" markedByName={null} status="completed" uid="bk-1" canAct />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mark happened/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(NOTES_CLOSED_CONFIRM);
    expect(dialog.textContent).not.toContain('The booking moves to Completed.');
  });

  it('keeps the confirmed-meeting wording as it was', () => {
    render(<MarkOutcomeButtons uid="bk-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Mark happened/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('The booking moves to Completed.');
    expect(dialog.textContent).not.toContain('already Completed');
  });

  it('leaves the no-show wording unchanged on a notes-closed meeting', () => {
    render(
      <OutcomeRecordedLine markedBy="notes" markedByName={null} status="completed" uid="bk-1" canAct />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mark no-show/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('The booking moves to No-show');
  });
});
