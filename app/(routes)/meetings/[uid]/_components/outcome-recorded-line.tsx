// app/(routes)/meetings/[uid]/_components/outcome-recorded-line.tsx
//
// The one line under a closed meeting's schedule that says HOW it was closed.
// An assumed outcome is not an observed one, so the line says which this is,
// and names a person only when a person actually closed it.
//
//   system  the retired 7-day sweep (before 21 Aug 2026) — nobody confirmed it
//   notes   the daily sweep closed it because meeting notes are linked to it
//           (Director, 2 Oct 2026). No person acted, so no name is shown —
//           the profile id is NULL for these rows by construction.
//   host / admin  a person — named whenever the record knows who.
//
// Rows marked before 20260926010000 carry only the actor kind, so for those the
// name is unavailable rather than wrong: they fall back to naming the kind,
// never to guessing a person.
//
// 3 Oct 2026 — the undo. A notes-closed meeting may have been closed because a
// note was linked by mistake. Under the line, the host (or a super admin) now
// gets the same two buttons an open meeting has, so they can record what
// really happened. The line keeps saying "closed automatically" until a person
// acts; fn_meeting_mark_outcome then re-stamps the row with that person and
// the buttons go away. The database is the security boundary — canAct only
// decides what is worth rendering.

import { MarkOutcomeButtons } from './mark-outcome-buttons';

export const CLOSED_WITH_NOTES_TEXT =
  "Closed automatically because the meeting's notes were linked.";

export const CORRECT_NOTES_CLOSE_TEXT = 'Wrong? You can still record what happened.';

/**
 * May this viewer correct how the meeting was closed? Only a notes-closed row
 * that no person has answered for, and only for its host or a super admin —
 * the same rows and the same people fn_meeting_mark_outcome accepts.
 */
export function canCorrectNotesClose(
  status: string | null | undefined,
  markedBy: string | null | undefined,
  canAct: boolean,
): boolean {
  return canAct && status === 'completed' && markedBy === 'notes';
}

export function outcomeRecordedText(
  markedBy: string | null | undefined,
  markedByName: string | null | undefined,
): string | null {
  if (!markedBy) return null;
  // The two automatic kinds come first, so a name can never be attached to
  // something no person did.
  if (markedBy === 'system') {
    return 'Closed automatically before 21 August 2026 — nobody confirmed it took place.';
  }
  if (markedBy === 'notes') return CLOSED_WITH_NOTES_TEXT;
  if (markedByName) return `Closed by ${markedByName}.`;
  return markedBy === 'host' ? 'Recorded by the host.' : 'Recorded by an administrator.';
}

export function OutcomeRecordedLine({
  markedBy,
  markedByName,
  status,
  uid,
  canAct = false,
}: {
  markedBy: string | null | undefined;
  markedByName: string | null | undefined;
  /** The booking's status; with uid and canAct, enables the notes-close undo. */
  status?: string | null;
  uid?: string;
  /** The viewer is the booking's host or a super admin. */
  canAct?: boolean;
}) {
  const text = outcomeRecordedText(markedBy, markedByName);
  if (!text) return null;
  const line = <p className="text-xs text-muted-foreground">{text}</p>;
  if (!uid || !canCorrectNotesClose(status, markedBy, canAct)) return line;
  return (
    <div className="space-y-2">
      {line}
      <p className="text-xs text-muted-foreground">{CORRECT_NOTES_CLOSE_TEXT}</p>
      <MarkOutcomeButtons uid={uid} notesClosed />
    </div>
  );
}
