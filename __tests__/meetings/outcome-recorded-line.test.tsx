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

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import {
  OutcomeRecordedLine,
  outcomeRecordedText,
} from '@/app/(routes)/meetings/[uid]/_components/outcome-recorded-line';
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
