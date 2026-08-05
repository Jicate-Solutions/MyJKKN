// lib/services/accreditation/meeting-minutes-compiler.ts
// ============================================================================
// Pure text helpers for turning several members' own accounts of a sitting into
// ONE official minutes text.
//
// Deliberately pure and dependency-free: no Supabase, no React. Everything that
// decides whether an existing minute is about to be destroyed lives here, so it
// can be tested directly instead of through a dialog. The rule the Director
// asked for — "compiling must never silently overwrite a non-empty
// minutes_summary" — is enforced by hasExistingMinutes() + an explicit merge
// mode the caller must choose; there is no default that silently replaces.
// ============================================================================

export interface MemberNoteForCompile {
  author_user_id: string;
  note_text: string;
}

/** How a compiled block relates to whatever minutes text already exists. */
export type MinutesMergeMode = 'replace' | 'append';

/** True when there is real minutes text that a replace would destroy. */
export function hasExistingMinutes(existing: string | null | undefined): boolean {
  return (existing ?? '').trim().length > 0;
}

/**
 * Assemble the member accounts into one block, attributed and in the order
 * given. Blank accounts are skipped — an untouched box is not an account, and
 * an empty heading in the official minutes would read as "this person said
 * nothing" rather than "this person has not written yet".
 *
 * Returns '' when nothing has been written; callers must treat '' as "nothing
 * to compile" and not write it anywhere.
 */
export function compileMemberNotes(
  notes: MemberNoteForCompile[],
  nameFor: (authorUserId: string) => string,
  meetingNo: number,
): string {
  const written = notes.filter((n) => n.note_text.trim().length > 0);
  if (written.length === 0) return '';

  const header =
    `Member accounts — meeting #${meetingNo} ` +
    `(${written.length} ${written.length === 1 ? 'account' : 'accounts'})`;

  const blocks = written.map(
    (n) => `${nameFor(n.author_user_id)}:\n${n.note_text.trim()}`,
  );

  return [header, ...blocks].join('\n\n');
}

/**
 * Combine the compiled block with whatever minutes text is already recorded.
 *
 * 'append'  — keeps every existing character and adds the block below it. Safe
 *             by construction; this is what the dialog offers first.
 * 'replace' — discards the existing text. The caller is responsible for having
 *             obtained an explicit confirmation when hasExistingMinutes() is
 *             true; this function does not and cannot ask.
 */
export function mergeMinutes(
  existing: string | null | undefined,
  compiled: string,
  mode: MinutesMergeMode,
): string {
  const current = (existing ?? '').trim();
  if (mode === 'replace') return compiled;
  if (current.length === 0) return compiled;
  if (compiled.length === 0) return current;
  return `${current}\n\n${compiled}`;
}
