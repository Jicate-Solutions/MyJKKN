// lib/utils/accommodation-type-resolver.ts
//
// Resolves an accommodation label (form radio 'HOSTEL'/'DAY SCHOLAR', Excel
// "Accommodation Type" column, or API input) to accommodation_types.id (FK).
// Storage on learners_profiles is accommodation_type_id only — the legacy
// `accommodation_type` TEXT column is being retired. This mirrors the matching
// the (now-removed) shadow-FK trigger did: code / name / code-with-spaces /
// name-without-spaces, case-insensitive, plus the handful of historical typo
// spellings backfilled 2026-06-02. Returns null when unmatched.
//
// accommodation_types is a GLOBAL lookup (4 codes: hostel / dayscholar /
// not_applicable / pg) since migration 20260610100000 — no institution scoping.

export type AccommodationTypeResolver = (
  raw: string | null | undefined,
) => string | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Historical free-text spellings → canonical code (backfilled 2026-06-02 in
// migration 20260602188000). Kept here so bulk-edit of older exited learners
// still resolves rather than silently dropping to null.
const TYPO_TO_CODE: Record<string, string> = {
  hosteller: 'hostel',
  hostler: 'hostel',
  dayscholer: 'dayscholar',
  daysscholar: 'dayscholar',
  dayschoalar: 'dayscholar',
  na: 'not_applicable',
};

// FK code → legacy uppercase binary used as the canonical INTERNAL value
// (form radio, `=== 'HOSTEL'` behavioural checks, validation enum). External
// API/Excel boundaries should expose accommodation_types.name instead.
export const ACCOMMODATION_CODE_TO_LEGACY: Record<string, string> = {
  hostel: 'HOSTEL',
  dayscholar: 'DAY SCHOLAR',
  not_applicable: 'NOT APPLICABLE',
  pg: 'PAYING GUEST',
};

/** Map a joined accommodation_types code to the legacy uppercase internal value. */
export function accommodationLegacyFromCode(
  code: string | null | undefined,
): string {
  if (!code) return '';
  return ACCOMMODATION_CODE_TO_LEGACY[code.toLowerCase()] ?? code;
}

function matchRow(
  rows: Array<{ id: string; code: string; name: string | null }>,
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const norm = String(raw).trim().toLowerCase();
  if (!norm) return null;
  if (UUID_RE.test(norm)) return norm; // already an id (form FK path)

  const noSpace = norm.replace(/\s+/g, '');
  const targetCode = TYPO_TO_CODE[norm] ?? TYPO_TO_CODE[noSpace];

  const match = rows.find((r) => {
    const code = r.code.toLowerCase();
    const name = (r.name ?? '').toLowerCase();
    return (
      (targetCode != null && code === targetCode) ||
      code === norm ||
      name === norm ||
      code.replace(/_/g, ' ') === norm ||
      name.replace(/\s+/g, '') === noSpace
    );
  });
  return match?.id ?? null;
}

export async function buildAccommodationTypeResolver(
  supabase: any,
): Promise<AccommodationTypeResolver> {
  const { data, error } = await supabase
    .from('accommodation_types')
    .select('id, code, name');
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; code: string; name: string | null }>;
  return (raw) => matchRow(rows, raw);
}

// Bulk-path variant. The institutionId arg is retained for call-site
// compatibility but ignored — accommodation_types is global now.
export type AccommodationTypeResolverMulti = (
  raw: string | null | undefined,
  institutionId?: string | null | undefined,
) => string | null;

export async function buildAccommodationTypeResolverMulti(
  supabase: any,
): Promise<AccommodationTypeResolverMulti> {
  const resolve = await buildAccommodationTypeResolver(supabase);
  return (raw) => resolve(raw);
}
