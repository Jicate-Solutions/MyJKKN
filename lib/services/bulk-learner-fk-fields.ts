// lib/services/bulk-learner-fk-fields.ts
//
// Single source of truth for the five learners_profiles columns that STORE an
// FK but TRAVEL through Excel as a readable label:
//
//   Community          -> community_category_id
//   Caste              -> caste_id
//   Quota              -> quota_id
//   Accommodation Type -> accommodation_type_id
//   Admission Year     -> admission_year_id   (cell holds the integer year)
//
// Why this module exists (2026-07-29):
// The legacy TEXT columns (community / caste / quota / accommodation_type /
// admission_year) were dropped in the FK-only migrations. The bulk-edit WRITE
// path was migrated to resolve label -> FK; the PREVIEW path was not. Preview
// kept reading `existingLearner['community']` — a column that no longer exists —
// which evaluates to `undefined`, renders as "(empty)", and therefore differed
// from EVERY populated cell. A freshly downloaded template round-tripped as
// ~4,200 learners x 4 "changes" without the user editing anything, which made
// the preview gate useless.
//
// Both paths now resolve through here and compare id-to-id. Keeping the mapping
// in one module is the point: the previous bug was preview and write disagreeing
// about where a field lives.
//
// Note every underlying resolver passes a UUID straight through, so ONE code
// path serves both the "<Field> ID" columns and the readable label columns —
// whichever the editor filled in.

import { buildQuotaResolver, type QuotaResolver } from '@/lib/utils/quota-name-resolver';
import { buildCommunityResolver, type CommunityResolver } from '@/lib/utils/community-name-resolver';
import { buildCasteResolver, type CasteResolver } from '@/lib/utils/caste-name-resolver';
import {
  buildAccommodationTypeResolverMulti,
  type AccommodationTypeResolverMulti,
} from '@/lib/utils/accommodation-type-resolver';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves an admission-year cell (integer year OR uuid) within one institution. */
export type AdmissionYearResolver = (
  raw: string | number | null | undefined,
  institutionId: string | null | undefined,
) => string | null;

export interface LearnerFkResolvers {
  community: CommunityResolver;
  caste: CasteResolver;
  quota: QuotaResolver;
  accommodation: AccommodationTypeResolverMulti;
  admissionYear: AdmissionYearResolver;
  /**
   * id -> display label, for rendering old/new values in the preview table.
   * Mirrors what the export writes into the readable column: community uses
   * `code` (MBC, SC, …), the rest use `name`, admission year uses the integer.
   */
  labels: {
    community: Map<string, string>;
    caste: Map<string, string>;
    quota: Map<string, string>;
    accommodation: Map<string, string>;
    admissionYear: Map<string, string>;
  };
}

/**
 * One FK-backed field: where the label arrives, where the id is stored, and
 * which label map renders it.
 */
export interface FkFieldSpec {
  /** Excel-facing label key produced by mapColumns (e.g. 'community'). */
  labelKey: string;
  /** learners_profiles column that actually stores the value. */
  idColumn: string;
  /** Human label for the preview table + error text. */
  fieldLabel: string;
  /** Which entry of LearnerFkResolvers.labels renders this id. */
  labelMap: keyof LearnerFkResolvers['labels'];
}

/**
 * Order matters: community resolves FIRST because caste resolution is
 * community-scoped (castes has duplicate names across communities).
 */
export const FK_FIELD_SPECS: FkFieldSpec[] = [
  { labelKey: 'community', idColumn: 'community_category_id', fieldLabel: 'Community', labelMap: 'community' },
  { labelKey: 'caste', idColumn: 'caste_id', fieldLabel: 'Caste', labelMap: 'caste' },
  { labelKey: 'quota', idColumn: 'quota_id', fieldLabel: 'Quota', labelMap: 'quota' },
  { labelKey: 'accommodation_type', idColumn: 'accommodation_type_id', fieldLabel: 'Accommodation Type', labelMap: 'accommodation' },
  { labelKey: 'admission_year', idColumn: 'admission_year_id', fieldLabel: 'Admission Year', labelMap: 'admissionYear' },
];

/** Every key resolveLearnerFkFields consumes — callers must skip these in generic diff/update loops. */
export const FK_CONSUMED_KEYS = new Set<string>([
  ...FK_FIELD_SPECS.map((s) => s.labelKey),
  ...FK_FIELD_SPECS.map((s) => s.idColumn),
]);

export interface FkFieldResolution {
  /** idColumn -> resolved uuid. Only contains fields the uploaded row actually carried. */
  ids: Record<string, string>;
  /** Cells that carried a value but matched no lookup row. Surfaced, never silently dropped. */
  unresolved: Array<{ field: string; fieldLabel: string; value: string }>;
}

/**
 * Load all five lookups and return synchronous resolvers.
 *
 * Cheap by design — the tables total ~1,100 rows (38 admission years, 1,069
 * castes, 11 communities, 5 quotas, 4 accommodation types), so a bulk edit of
 * several thousand learners does five queries total instead of five per row.
 */
export async function buildLearnerFkResolvers(supabase: any): Promise<LearnerFkResolvers> {
  const [community, caste, quota, accommodation] = await Promise.all([
    buildCommunityResolver(supabase),
    buildCasteResolver(supabase),
    buildQuotaResolver(supabase),
    buildAccommodationTypeResolverMulti(supabase),
  ]);

  const [communityRows, casteRows, quotaRows, accommodationRows, admissionYearRows] = await Promise.all([
    supabase.from('community_categories').select('id, code'),
    supabase.from('castes').select('id, name'),
    supabase.from('quotas').select('id, name'),
    supabase.from('accommodation_types').select('id, name'),
    supabase.from('admission_years').select('id, year, institution_id'),
  ]);

  const toMap = (res: any, key: string) => {
    const map = new Map<string, string>();
    for (const row of (res?.data ?? []) as any[]) {
      if (row.id && row[key] != null) map.set(row.id, String(row[key]));
    }
    return map;
  };

  const years = (admissionYearRows?.data ?? []) as Array<{
    id: string;
    year: number;
    institution_id: string | null;
  }>;

  const admissionYear: AdmissionYearResolver = (raw, institutionId) => {
    if (raw == null || raw === '') return null;
    const norm = String(raw).trim().toLowerCase();
    if (!norm) return null;
    if (UUID_RE.test(norm)) return norm; // the "Admission Year ID" column
    const year = Number(norm);
    if (!Number.isFinite(year)) return null;
    if (!institutionId) return null;
    // Exact (year, institution) only. resolveAdmissionYearId() falls back to
    // "latest active cohort" for legacy imports; that is wrong for an
    // interactive bulk edit — a typo'd year must surface in the preview as
    // unresolved rather than silently retarget the learner to another cohort.
    return years.find((r) => r.institution_id === institutionId && r.year === year)?.id ?? null;
  };

  return {
    community,
    caste,
    quota,
    accommodation,
    admissionYear,
    labels: {
      community: toMap(communityRows, 'code'),
      caste: toMap(casteRows, 'name'),
      quota: toMap(quotaRows, 'name'),
      accommodation: toMap(accommodationRows, 'name'),
      admissionYear: toMap(admissionYearRows, 'year'),
    },
  };
}

// Process-level cache. Bulk edit is called once per upload but iterates
// thousands of rows, and the lookups are effectively static. A short TTL keeps
// a newly added quota/cohort from being invisible for the life of the process.
const RESOLVER_TTL_MS = 60_000;
let resolverCache: { at: number; value: Promise<LearnerFkResolvers> } | null = null;

export function getLearnerFkResolvers(supabase: any): Promise<LearnerFkResolvers> {
  if (resolverCache && Date.now() - resolverCache.at < RESOLVER_TTL_MS) {
    return resolverCache.value;
  }
  const value = buildLearnerFkResolvers(supabase);
  resolverCache = { at: Date.now(), value };
  // Never cache a rejection — the next upload must be able to retry.
  value.catch(() => {
    resolverCache = null;
  });
  return value;
}

export interface ResolveFkContext {
  /** The LEARNER's institution (not the uploader's) — admission_years is institution-scoped. */
  institutionId?: string | null;
  /** Existing learners_profiles row, used to scope caste resolution when the sheet didn't change community. */
  existing?: Record<string, any> | null;
}

/**
 * Turn whatever the uploaded row carries — "<Field> ID" uuids, readable labels,
 * or nothing — into the canonical FK columns.
 *
 * Precedence per field: the "<Field> ID" cell wins over the label cell. Both go
 * through the same resolver, which passes UUIDs through untouched.
 */
export function resolveLearnerFkFields(
  row: Record<string, any>,
  resolvers: LearnerFkResolvers,
  ctx: ResolveFkContext = {},
): FkFieldResolution {
  const ids: Record<string, string> = {};
  const unresolved: FkFieldResolution['unresolved'] = [];

  for (const spec of FK_FIELD_SPECS) {
    const raw = row[spec.idColumn] ?? row[spec.labelKey];
    if (raw === undefined || raw === null || raw === '') continue;

    let resolved: string | null;
    if (spec.labelKey === 'caste') {
      // Community-scoped: prefer the community this same upload is setting,
      // else the one already on the learner.
      const communityId =
        ids.community_category_id ?? ctx.existing?.community_category_id ?? null;
      resolved = resolvers.caste(String(raw), communityId);
    } else if (spec.labelKey === 'admission_year') {
      resolved = resolvers.admissionYear(raw, ctx.institutionId ?? ctx.existing?.institution_id ?? null);
    } else if (spec.labelKey === 'accommodation_type') {
      resolved = resolvers.accommodation(String(raw), ctx.institutionId ?? null);
    } else if (spec.labelKey === 'community') {
      resolved = resolvers.community(String(raw));
    } else {
      resolved = resolvers.quota(String(raw));
    }

    if (resolved) {
      ids[spec.idColumn] = resolved;
    } else {
      unresolved.push({ field: spec.labelKey, fieldLabel: spec.fieldLabel, value: String(raw) });
    }
  }

  return { ids, unresolved };
}

/** Render an FK id as the label the export would have written. */
export function fkLabel(
  resolvers: LearnerFkResolvers,
  spec: FkFieldSpec,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return resolvers.labels[spec.labelMap].get(id) ?? id;
}
