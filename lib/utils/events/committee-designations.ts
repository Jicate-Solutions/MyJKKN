// lib/utils/events/committee-designations.ts
// Per-person committee designations (BUG-004626), stored in
// event_committees.member_designations as { [displayed name]: designation }.
// Pure helpers so the add / clear / rename-on-remove rules are testable.

export type CommitteeDesignations = Record<string, string>;

/** Suggested designations offered in the edit dialog; free text is also allowed. */
export const DESIGNATION_SUGGESTIONS = [
  'Main Coordinator',
  'Coordinator',
  'Co-Coordinator',
  'Member',
  'Volunteer',
] as const;

/** Tolerates null / non-object values from older rows. */
export function readDesignations(raw: unknown): CommitteeDesignations {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: CommitteeDesignations = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * The map to save for the people currently on the committee: trims values,
 * drops blanks, and drops keys for anyone no longer on the roster.
 */
export function buildDesignations(
  names: string[],
  edits: Record<string, string>
): CommitteeDesignations {
  const out: CommitteeDesignations = {};
  for (const name of names) {
    const v = (edits[name] ?? '').trim();
    if (v) out[name] = v.slice(0, 60);
  }
  return out;
}

/** The map after `name` leaves the committee. */
export function withoutDesignation(
  current: unknown,
  name: string | undefined
): CommitteeDesignations {
  const map = readDesignations(current);
  if (name !== undefined) delete map[name];
  return map;
}
