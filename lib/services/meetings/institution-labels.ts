// lib/services/meetings/institution-labels.ts
//
// Deliberately NOT inside app/(routes)/meetings/series/actions.ts. That file is
// a 'use server' module, and Next.js requires every export from one to be an
// async function — exporting this synchronous helper from there fails the
// production build with "Server Actions must be async functions". Making it
// async instead would ripple into every caller and mint a public server-action
// endpoint for what is a pure string function, so it lives here.

export interface InstitutionOption {
  id: string;
  name: string;
}

/**
 * Turn institution rows into labels that a person can actually tell apart.
 *
 * Two LIVE colleges share a display_name: "JKKN College of Arts and Science
 * (Autonomous)" is the display_name of BOTH the Aided institution and the Self
 * one, whose real `name` values differ ("(Aided)" vs "(Self)"). Preferring
 * display_name unconditionally therefore renders them as two identical rows.
 *
 * On most screens that is cosmetic. Here it is not: this list feeds the
 * rotation order, where the user is asked to rank WHICH COLLEGE YIELDS a
 * meeting slot. Two indistinguishable rows make that an unanswerable question,
 * and at 390px both truncate to "JKKN College of Arts a..." anyway.
 *
 * So: keep display_name where it is unique, and fall back to `name` where it is
 * not. That is correct whichever display_name later turns out to be the wrong
 * one, and it needs no change to the institutions record.
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
