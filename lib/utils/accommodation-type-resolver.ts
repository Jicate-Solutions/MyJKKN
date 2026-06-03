// lib/utils/accommodation-type-resolver.ts
//
// Resolves an accommodation label (form radio 'HOSTEL'/'DAY SCHOLAR', Excel
// "Accommodation Type" column, or API input) to accommodation_types.id (FK),
// scoped to ONE institution. Storage on learners_profiles is accommodation_type_id
// only — the legacy `accommodation_type` TEXT column is being retired. This
// mirrors the matching the (now-removed) shadow-FK trigger did: code / name /
// code-with-spaces / name-without-spaces, case-insensitive, plus the handful of
// historical typo spellings backfilled 2026-06-02. Returns null when unmatched.
//
// accommodation_types is institution-scoped (4 codes × 13 institutions:
// hostel / dayscholar / not_applicable / pg), so a resolver instance is bound to
// a single institution_id.

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
  institutionId: string,
): Promise<AccommodationTypeResolver> {
  const { data, error } = await supabase
    .from('accommodation_types')
    .select('id, code, name')
    .eq('institution_id', institutionId);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; code: string; name: string | null }>;
  return (raw) => matchRow(rows, raw);
}

// Multi-institution variant for bulk paths where rows span institutions. The
// caller passes the row's institution_id with each lookup; resolution is scoped
// to that institution's accommodation_types.
export type AccommodationTypeResolverMulti = (
  raw: string | null | undefined,
  institutionId: string | null | undefined,
) => string | null;

export async function buildAccommodationTypeResolverMulti(
  supabase: any,
): Promise<AccommodationTypeResolverMulti> {
  const { data, error } = await supabase
    .from('accommodation_types')
    .select('id, code, name, institution_id');
  if (error) throw error;

  const byInstitution = new Map<
    string,
    Array<{ id: string; code: string; name: string | null }>
  >();
  for (const r of (data ?? []) as Array<{
    id: string;
    code: string;
    name: string | null;
    institution_id: string;
  }>) {
    const list = byInstitution.get(r.institution_id) ?? [];
    list.push({ id: r.id, code: r.code, name: r.name });
    byInstitution.set(r.institution_id, list);
  }

  return (raw, institutionId) => {
    if (!institutionId) return null;
    return matchRow(byInstitution.get(institutionId) ?? [], raw);
  };
}
