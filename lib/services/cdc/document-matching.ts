/**
 * lib/services/cdc/document-matching.ts
 *
 * Filename → learner matching for bulk document upload. Pure (no I/O) so the
 * preview and the server-side re-check run the exact same rules.
 *
 * Priority:
 *   1. the normalized filename IS a register number
 *   2. the normalized filename IS a roll number
 *   3. the normalized filename CONTAINS exactly one learner's register / roll
 *      number (longest identifier wins, so "2026001" is not mistaken for a
 *      learner whose number is "202600")
 *
 * More than one learner at the winning priority → 'multiple' (never
 * auto-assigned). Nothing found → 'none'.
 */

export interface MatchCandidate {
  learner_id: string;
  name: string;
  register_number: string | null;
  roll_number: string | null;
}

export type MatchKind = 'register_exact' | 'roll_exact' | 'register_contained' | 'roll_contained';

export type MatchResult =
  | { status: 'matched'; candidate: MatchCandidate; kind: MatchKind }
  | { status: 'multiple'; candidates: MatchCandidate[] }
  | { status: 'none' };

/** Strip the extension, then everything that is not a letter or digit; upper-case. */
export function normalizeForMatch(value: string): string {
  const base = value.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return base.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normId(value: string | null | undefined): string {
  return (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Identifiers shorter than this are too ambiguous to find INSIDE a longer filename. */
const MIN_CONTAINED_LENGTH = 5;

function uniqueByLearner(list: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.learner_id) ? false : (seen.add(c.learner_id), true)));
}

export function matchFilename(fileName: string, candidates: MatchCandidate[]): MatchResult {
  const key = normalizeForMatch(fileName);
  if (!key) return { status: 'none' };

  const regExact = uniqueByLearner(candidates.filter((c) => normId(c.register_number) && normId(c.register_number) === key));
  if (regExact.length === 1) return { status: 'matched', candidate: regExact[0], kind: 'register_exact' };
  if (regExact.length > 1) return { status: 'multiple', candidates: regExact };

  const rollExact = uniqueByLearner(candidates.filter((c) => normId(c.roll_number) && normId(c.roll_number) === key));
  if (rollExact.length === 1) return { status: 'matched', candidate: rollExact[0], kind: 'roll_exact' };
  if (rollExact.length > 1) return { status: 'multiple', candidates: rollExact };

  // Contained identifiers. Longest identifier wins; ties between different learners → manual review.
  type Hit = { candidate: MatchCandidate; kind: MatchKind; length: number };
  const hits: Hit[] = [];
  for (const c of candidates) {
    const reg = normId(c.register_number);
    const roll = normId(c.roll_number);
    if (reg.length >= MIN_CONTAINED_LENGTH && key.includes(reg)) hits.push({ candidate: c, kind: 'register_contained', length: reg.length });
    else if (roll.length >= MIN_CONTAINED_LENGTH && key.includes(roll)) hits.push({ candidate: c, kind: 'roll_contained', length: roll.length });
  }
  if (hits.length === 0) return { status: 'none' };
  const longest = Math.max(...hits.map((h) => h.length));
  const top = hits.filter((h) => h.length === longest);
  const learners = uniqueByLearner(top.map((h) => h.candidate));
  if (learners.length === 1) return { status: 'matched', candidate: learners[0], kind: top[0].kind };
  return { status: 'multiple', candidates: learners };
}

export const BULK_DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'] as const;

export function extensionOf(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(fileName);
  return m ? m[1].toLowerCase() : '';
}

export function isAllowedDocumentFile(fileName: string): boolean {
  return (BULK_DOCUMENT_EXTENSIONS as readonly string[]).includes(extensionOf(fileName));
}
