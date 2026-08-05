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
  durationMin: number;
  description: string | null;
  /** Every format this purpose is offered in — usually one, sometimes two. */
  options: T[];
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
      description: mt.description,
      options: [mt],
    });
  }
  return [...byKey.values()].sort((a, b) => a.durationMin - b.durationMin);
}
