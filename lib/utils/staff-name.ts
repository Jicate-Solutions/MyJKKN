// lib/utils/staff-name.ts
//
// Canonical form for staff names: UPPERCASE, ends trimmed, internal whitespace
// runs collapsed to a single space.
//
// The DATABASE is the guarantee — migration 20260910120000 added
// trg_normalize_staff_names (BEFORE INSERT OR UPDATE on staff) plus the
// staff_first_name_canonical / staff_last_name_canonical CHECK constraints, so
// a name cannot be stored in any other form no matter which path writes it
// (form, bulk upload, bulk edit, onboarding, raw SQL, B2A).
//
// This helper exists so the UI is HONEST: applying it client-side means the
// preview table and the saved record agree, instead of the user typing
// "Anil Kumar " and seeing it silently become "ANIL KUMAR" only after a reload.
// Keep it in lockstep with public.fn_canonical_staff_name(text).

/**
 * Canonicalise a staff first/last name.
 *
 * `null` / `undefined` pass through unchanged so callers can distinguish
 * "not supplied" from "supplied as empty" — the DB column is nullable and the
 * SQL function has the same null-in/null-out contract.
 */
export function normalizeStaffName<T extends string | null | undefined>(name: T): T {
  if (name === null || name === undefined) return name;
  return (name as string).trim().replace(/\s+/g, ' ').toUpperCase() as T;
}

/**
 * Convenience for the common `{ first_name, last_name }` shape. Only the keys
 * actually present are touched, so it is safe to spread over a partial update
 * payload without resurrecting fields the caller deliberately omitted.
 */
export function normalizeStaffNameFields<
  T extends { first_name?: string | null; last_name?: string | null },
>(input: T): T {
  const out = { ...input };
  if ('first_name' in out) out.first_name = normalizeStaffName(out.first_name);
  if ('last_name' in out) out.last_name = normalizeStaffName(out.last_name);
  return out;
}
