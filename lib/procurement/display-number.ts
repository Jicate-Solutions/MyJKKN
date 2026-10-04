// lib/procurement/display-number.ts
//
// Requests are stored and shown as PR-YYMMDD-NNNNN (procurement_next_number,
// doc type 'PR'). Staff asked to keep that familiar "PR" format on screen too
// (2026-09-29), after a short trial of an on-screen "REQ-" prefix. Every screen
// still goes through displayRequestNumber, so the format can change in one place.

export function displayRequestNumber(stored: string | null | undefined): string {
  return stored ?? '';
}

/** A search typed with the trial "REQ-" prefix still finds the stored number. */
export function toStoredRequestNumber(typed: string): string {
  return typed.replace(/^\s*REQ-?/i, 'PR-');
}
