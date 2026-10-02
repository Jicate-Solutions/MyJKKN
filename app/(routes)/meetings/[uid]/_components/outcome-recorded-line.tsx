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

export const CLOSED_WITH_NOTES_TEXT =
  "Closed automatically because the meeting's notes were linked.";

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
}: {
  markedBy: string | null | undefined;
  markedByName: string | null | undefined;
}) {
  const text = outcomeRecordedText(markedBy, markedByName);
  if (!text) return null;
  return <p className="text-xs text-muted-foreground">{text}</p>;
}
