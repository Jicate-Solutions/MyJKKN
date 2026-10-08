/**
 * HR intake helper — the same person on more than one row of one export.
 * Pure. Two rows are the same person when they share an email, a phone number,
 * or a name together with a phone number. The links chain: if row 3 shares an
 * email with row 2 and row 2 shares a phone with row 1, all three are one person.
 * Every later row points at the EARLIEST row of its group.
 */

import type { IntakeCandidate } from '@/types/hr-intake';

export interface SameFileDuplicate {
  /** row_index of the earliest row of the group. */
  ref_row_index: number;
  /** What they share, e.g. "same phone number". */
  shared: string;
  note: string;
}

interface DedupeInput {
  row_index: number;
  candidate: Pick<IntakeCandidate, 'first_name' | 'last_name' | 'email' | 'phone'>;
}

const nameKey = (c: DedupeInput['candidate']) =>
  `${c.first_name} ${c.last_name}`.toLowerCase().replace(/[^a-z]/g, '');

/** Map row_index -> duplicate pointer, for every row that is not the first of its group. */
export function findSameFileDuplicates(rows: DedupeInput[]): Map<number, SameFileDuplicate> {
  const sorted = [...rows].sort((a, b) => a.row_index - b.row_index);
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    let n = x;
    while (parent.get(n) !== r) {
      const next = parent.get(n) as number;
      parent.set(n, r);
      n = next;
    }
    return r;
  };
  // The earlier row is always the root, so a group's root is its earliest row.
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };

  for (const r of sorted) parent.set(r.row_index, r.row_index);

  const firstBy = new Map<string, number>();
  const link = (key: string | null, row: number) => {
    if (!key) return;
    const seen = firstBy.get(key);
    if (seen === undefined) firstBy.set(key, row);
    else union(seen, row);
  };
  for (const r of sorted) {
    link(r.candidate.email ? `e:${r.candidate.email.toLowerCase()}` : null, r.row_index);
    link(r.candidate.phone ? `p:${r.candidate.phone}` : null, r.row_index);
    const nk = nameKey(r.candidate);
    link(nk && r.candidate.phone ? `n:${nk}:${r.candidate.phone}` : null, r.row_index);
  }

  const out = new Map<number, SameFileDuplicate>();
  const byRow = new Map(sorted.map((r) => [r.row_index, r]));
  for (const r of sorted) {
    const root = find(r.row_index);
    if (root === r.row_index) continue;
    const first = byRow.get(root)!.candidate;
    const sameEmail = !!r.candidate.email && r.candidate.email.toLowerCase() === first.email?.toLowerCase();
    const samePhone = !!r.candidate.phone && r.candidate.phone === first.phone;
    const shared = sameEmail && samePhone
      ? 'same email and phone number'
      : sameEmail
        ? 'same email'
        : samePhone
          ? 'same phone number'
          : 'linked through another row';
    out.set(r.row_index, {
      ref_row_index: root,
      shared,
      note: `Same person as row ${root} in this file (${shared})`,
    });
  }
  return out;
}
