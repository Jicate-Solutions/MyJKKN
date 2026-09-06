// ============================================================================
// lib/services/id-cards/template-picker.ts
// Created: 2026-08-13 — inactive templates must not reach a print picker.
//
// The ID-card template pickers exist on TWO kinds of screen, and they are not
// the same screen:
//
//   PRINT paths  (single Print ID Card button, bulk print, batch print) send
//                plastic through a card printer. A template stays deliberately
//                dark (active = false) until its verification print passes, so
//                an inactive template must never be OFFERED and must never be
//                PRE-SELECTED here.
//
//   ADMIN paths  (Card design, Back design, Field mappings) are how a dark
//                template is designed in the first place. Hiding inactive rows
//                there would make a new template unreachable, so admin keeps
//                the full list and only its DEFAULT changes: prefer an active
//                template, fall back to a dark one, and say so on screen.
//
// Everything here is pure — no Supabase client, no React — so the print-path
// rule is unit-testable in vitest's default `node` environment
// (__tests__/lib/id-cards/template-picker-active.test.ts). That matters: the
// regression this file prevents lives in a `useEffect`, and a test that has to
// mount a component to reach it is a test nobody keeps green.
// ============================================================================

/** Minimum shape every picker row shares (print option or admin design row). */
export type TemplateActivationRow = {
  id: string;
  active: boolean;
};

/**
 * Rows a PRINT picker may show. Inactive templates are dropped entirely —
 * on a print path there is nothing useful to do with one.
 */
export function activeTemplatesOnly<T extends TemplateActivationRow>(
  rows: readonly T[]
): T[] {
  return rows.filter((row) => row.active);
}

/**
 * True when templates exist but not one of them is switched on. This is a
 * DIFFERENT operator problem from "no templates exist at all" — it is fixed on
 * the Template page in one click, not by building a card from scratch — so the
 * two states get two different messages. Keeping the unfiltered list in hand is
 * the only reason this is knowable without a second round trip.
 */
export function hasOnlyInactiveTemplates<T extends TemplateActivationRow>(
  rows: readonly T[]
): boolean {
  return rows.length > 0 && rows.every((row) => !row.active);
}

/**
 * The template a PRINT picker should start on.
 *
 * Order: the remembered choice (only if it is still active), then the first
 * active row, then nothing. `null` is a real answer — it leaves the picker
 * empty and the Print button disabled, which is the correct outcome when no
 * template has passed its verification print yet.
 *
 * Both halves of the old bug are closed here. The remembered id came from
 * localStorage and was honoured with no re-check of `active`, so one click on a
 * test template pinned it on that browser forever; and the final fallback was a
 * bare `rows[0]`, which — with every template dark, collapsing the `active DESC`
 * sort to name order — handed the print dialog whatever sorted first.
 */
export function pickPreferredPrintTemplate<T extends TemplateActivationRow>(
  rows: readonly T[],
  lastTemplateId: string | null
): T | null {
  const activeRows = activeTemplatesOnly(rows);
  if (activeRows.length === 0) return null;
  const remembered = lastTemplateId
    ? activeRows.find((row) => row.id === lastTemplateId)
    : undefined;
  return remembered ?? activeRows[0];
}

/**
 * The template an ADMIN picker should start on.
 *
 * Admin keeps every row, including dark ones — you cannot design a template you
 * are not allowed to open. So this only moves the DEFAULT: hold the current
 * selection if it still exists, else prefer an active template, else fall back
 * to the first row so the tab is never stranded empty. Returns '' when there
 * are no templates at all (the Select's own empty state).
 */
export function pickPreferredAdminTemplateId<T extends TemplateActivationRow>(
  rows: readonly T[],
  currentId: string
): string {
  if (currentId && rows.some((row) => row.id === currentId)) return currentId;
  const firstActive = rows.find((row) => row.active);
  return firstActive?.id ?? rows[0]?.id ?? '';
}
