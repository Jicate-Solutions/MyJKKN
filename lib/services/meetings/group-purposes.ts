// lib/services/meetings/group-purposes.ts
//
// Collapse a host's meeting types into the choices a booker actually makes.
//
// Types sharing a `purposeGroup` are ONE choice — same meeting, different
// formats — and that value is the choice's label. A type without a group keeps
// standing alone under its own title, which is how every booking page behaved
// before grouping existed, so a host who has not set it sees no change.
//
// This restores a concept the 2026-06-11 Calendly import lost: 14 types came
// from Calendly events whose location was "in-person / online, invitee
// chooses". meeting_types had nowhere to record that, so the import forced one
// location_mode and left the real meaning in free text.
//
// Shared by BOTH public booking surfaces (/meet/[handle] and /embed/[handle])
// so they cannot drift — the embed mirrors the page it is embedded from.

/** The subset of a public meeting type this module needs. */
export interface GroupablePurposeType {
  id: string;
  title: string;
  durationMin: number;
  description: string | null;
  purposeGroup: string | null;
}

export interface PurposeChoice<T extends GroupablePurposeType> {
  key: string;
  label: string;
  /**
   * SHORTEST length in the group, kept for stable sorting only.
   *
   * Do NOT render this as "the" duration of the card when `hasMixedDurations`
   * is true — it is one option's number standing in for several, which is
   * exactly the thing that misleads a booker. Render `durationsMin`, or the
   * per-option `durationMin`, instead.
   */
  durationMin: number;
  /** Every distinct length this purpose is offered in, ascending. */
  durationsMin: number[];
  /** True when the purpose is offered in more than one length. */
  hasMixedDurations: boolean;
  description: string | null;
  /** Every format this purpose is offered in — usually one, sometimes two. */
  options: T[];
}

/**
 * The length label for a purpose card: `"15 min"` when there is one length,
 * `"2 / 5 / 10 / 15 min"` when the purpose spans several.
 *
 * A purpose that spans lengths must never advertise a single number — the
 * booker would pick a card believing it is one length and land on another.
 * Where the individual formats are listed, show each option's own length too.
 */
export function purposeDurationLabel(choice: {
  durationsMin: readonly number[];
  durationMin: number;
}): string {
  const lengths = choice.durationsMin.length ? choice.durationsMin : [choice.durationMin];
  return `${lengths.join(' / ')} min`;
}

export function groupPurposes<T extends GroupablePurposeType>(
  types: readonly T[],
): PurposeChoice<T>[] {
  const byKey = new Map<string, PurposeChoice<T>>();
  for (const mt of types) {
    // Whitespace-only is treated as unset so a stray space typed in the host
    // editor cannot create a group of one carrying a blank label.
    const group = (mt.purposeGroup ?? '').trim() || null;
    const key = group ?? `__solo__${mt.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.options.push(mt);
      // A grouped card describes the purpose, not one of its formats — keep the
      // first non-empty description rather than whichever arrived last.
      existing.description ??= mt.description;
      continue;
    }
    byKey.set(key, {
      key,
      label: group ?? mt.title,
      durationMin: mt.durationMin,
      durationsMin: [],
      hasMixedDurations: false,
      description: mt.description,
      options: [mt],
    });
  }

  // Derive the length set once every option is in. A purpose deliberately
  // spans several lengths ("Quick question" is 2/5/10/15), so a card cannot
  // carry a single number: the first record's duration would be wrong for the
  // other three. durationMin collapses to the SHORTEST purely so the sort
  // below stays stable and puts the quickest purposes first.
  for (const choice of byKey.values()) {
    const lengths = [...new Set(choice.options.map((o) => o.durationMin))].sort(
      (a, b) => a - b,
    );
    choice.durationsMin = lengths;
    choice.hasMixedDurations = lengths.length > 1;
    choice.durationMin = lengths[0] ?? choice.durationMin;
  }

  return [...byKey.values()].sort((a, b) => a.durationMin - b.durationMin);
}
