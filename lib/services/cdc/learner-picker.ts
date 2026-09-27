/**
 * Learner picker options for CDC forms — the label a coordinator searches, and
 * the number matching behind "Bulk Add Learners".
 *
 * A learner carries TWO numbers: `register_number` and `roll_number`. The
 * picker used to show and match only the register number, while the bulk box
 * is labelled "Register / Roll numbers". Measured on production (24 Sep 2026,
 * active + graduated learners): the roll number differs from the register
 * number for 1,040 of 1,294 Engineering learners, and 319 of them have no
 * register number at all — so a search or paste by roll number found nobody
 * (BUG-005031).
 *
 * Pure module: the picker route (server) and the bulk dialog (browser) share it,
 * so what the list shows and what a paste matches cannot drift apart.
 */

export interface LearnerNumbers {
  register_number: string | null;
  roll_number: string | null;
}

export interface LearnerPickerRow extends LearnerNumbers {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface LearnerPickerOption extends LearnerNumbers {
  value: string;
  label: string;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/**
 * "First Last (REG)" as before; the roll number is added only when it says
 * something the register number does not: "First Last (REG · Roll 21CS07)",
 * or "First Last (Roll 21CS07)" when there is no register number.
 */
export function learnerPickerLabel(row: Omit<LearnerPickerRow, 'id'>): string {
  const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
  const register = clean(row.register_number);
  const roll = clean(row.roll_number);
  const numbers: string[] = [];
  if (register) numbers.push(register);
  if (roll && roll.toLowerCase() !== register?.toLowerCase()) numbers.push(`Roll ${roll}`);
  return numbers.length > 0 ? `${name} (${numbers.join(' · ')})` : name;
}

export function toLearnerPickerOption(row: LearnerPickerRow): LearnerPickerOption {
  return {
    value: row.id,
    label: learnerPickerLabel(row),
    register_number: clean(row.register_number),
    roll_number: clean(row.roll_number),
  };
}

export interface PastedNumberMatch {
  /** Learner ids to enroll, each once — a register AND a roll number for the same learner enroll them once. */
  toEnroll: string[];
  /** Lines naming a learner who is already enrolled. */
  skipped: string[];
  /** Lines that match no learner. */
  missing: string[];
  /**
   * Lines whose number belongs to more than one learner (147 such numbers exist
   * across institutions). Enrolling "the last one seen" would put the wrong
   * learner on the programme, so these are refused and listed instead.
   */
  ambiguous: string[];
}

/**
 * Match pasted lines (one number each) against the picker options by register
 * OR roll number, case-insensitively.
 */
export function matchPastedLearnerNumbers(
  lines: string[],
  options: ReadonlyArray<{ value: string } & Partial<LearnerNumbers>>,
  alreadyEnrolled: ReadonlySet<string>
): PastedNumberMatch {
  const byNumber = new Map<string, Set<string>>();
  for (const option of options) {
    for (const number of [option.register_number, option.roll_number]) {
      const key = clean(number)?.toLowerCase();
      if (!key) continue;
      const ids = byNumber.get(key) ?? new Set<string>();
      ids.add(option.value);
      byNumber.set(key, ids);
    }
  }

  const result: PastedNumberMatch = { toEnroll: [], skipped: [], missing: [], ambiguous: [] };
  const queued = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const ids = byNumber.get(line.toLowerCase());
    if (!ids) {
      result.missing.push(line);
      continue;
    }
    if (ids.size > 1) {
      result.ambiguous.push(line);
      continue;
    }
    const [learnerId] = Array.from(ids);
    if (alreadyEnrolled.has(learnerId)) result.skipped.push(line);
    else if (!queued.has(learnerId)) {
      queued.add(learnerId);
      result.toEnroll.push(learnerId);
    }
  }
  return result;
}
