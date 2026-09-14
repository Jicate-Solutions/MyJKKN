// lib/utils/institutions/institution-labels.ts
//
// Neutral home. This started life under lib/services/meetings/ because the
// meeting rotation screen was the first place the collision below became
// unanswerable, but nothing in it is meetings-specific: it is a pure string
// function over institution rows, and three unrelated screens now need it.
//
// It is NOT inside app/(routes)/meetings/series/actions.ts (its original
// caller) for a build reason worth keeping written down: that file is a
// 'use server' module, and Next.js requires every export from one to be an
// async function — exporting this synchronous helper from there fails the
// production build with "Server Actions must be async functions". Making it
// async instead would ripple into every caller and mint a public server-action
// endpoint for what is a pure string function.

export interface InstitutionOption {
  id: string;
  name: string;
}

/**
 * Turn institution rows into labels that a person can actually tell apart.
 *
 * Two LIVE colleges share a display_name: "JKKN College of Arts and Science
 * (Autonomous)" is the display_name of BOTH the Aided institution
 * (a33138b6…) and the Self one (b0b8a724…), whose real `name` values differ
 * ("(Aided)" vs "(Self)"). Preferring display_name unconditionally therefore
 * renders two distinct institutions as two identical rows.
 *
 * On a read-only report that is cosmetic. On a screen where somebody PICKS one
 * — a cluster member list, a taxonomy row they can delete — it is not: two
 * indistinguishable rows make the choice unanswerable, and at 390px both
 * truncate to "JKKN College of Arts a..." anyway.
 *
 * So: keep display_name where it is unique, and fall back to `name` where it
 * is not. That is correct whichever display_name later turns out to be the
 * wrong one, and it needs no change to the institutions record — the data
 * question (which college keeps "(Autonomous)") stays open and unprejudiced.
 *
 * Note `||` rather than `??`: an empty-string display_name is not a label, and
 * falling through to `name` is the only useful reading of it.
 */
export function labelInstitutions(
  rows: Array<{ id: string; name: string; display_name?: string | null }>,
): InstitutionOption[] {
  const uses = new Map<string, number>();
  for (const r of rows) {
    const label = r.display_name || r.name;
    uses.set(label, (uses.get(label) ?? 0) + 1);
  }
  return rows.map((r) => {
    const label = r.display_name || r.name;
    // Ambiguous label -> use `name`, which distinguishes Aided from Self.
    return { id: r.id, name: (uses.get(label) ?? 0) > 1 ? r.name : label };
  });
}

/**
 * Same rule, indexed by id — for callers that render a list they already hold
 * (a checkbox grid, a chip roster) rather than replacing it.
 *
 * Collision detection MUST run over the full candidate list, never over a
 * selected subset: if only one of the Aided/Self pair is selected, the subset
 * has no collision and would render "(Autonomous)" while the picker that
 * chose it rendered "(Aided)". Two names for one click is worse than one
 * ambiguous name. Pass the whole list here, then look up the members.
 */
export function institutionLabelById(
  rows: Array<{ id: string; name: string; display_name?: string | null }>,
): Map<string, string> {
  return new Map(labelInstitutions(rows).map((o) => [o.id, o.name]));
}
