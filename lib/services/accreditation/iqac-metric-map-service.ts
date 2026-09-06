// lib/services/accreditation/iqac-metric-map-service.ts
// ============================================================================
// Reads the 48 → 107 correspondence from a CONFIG ROW, never from TypeScript.
//
// Standing repo rule (docs/architecture/config-table-pattern.md): "Every
// threshold, MAPPING, flag, schedule, or routing rule that a super-admin might
// tweak — even once — gets a database row, a function that reads it at runtime,
// and a super-admin UI to edit it." A mapping is named in that rule's own DOES
// list. So the correspondence between the CEO's 48 CAC dimensions and the 107
// master framework metrics lives in `public.iqac_cac_metric_map`, one row per
// claimed correspondence, and this service is the runtime reader.
//
// ----------------------------------------------------------------------------
// THE TABLE IS NOT PROVISIONED YET, AND THAT IS NOT AN ERROR HERE
// ----------------------------------------------------------------------------
// Its migration ships as a FILE ONLY — applying it is Director-gated, like every
// other migration in this repo. Until it is applied, PostgREST answers a read
// with PGRST205 ("could not find the table in the schema cache") rather than
// rows. That is a KNOWN state, not a failure, so it is reported as
// `registryAvailable: false` and the screen says so in words.
//
// The alternative — falling back to a hardcoded map in this file — is the thing
// the config-table rule exists to prevent, and it would also be a fabrication:
// nobody has yet established which of the 107 rubric metrics any of the CEO's 48
// dimensions corresponds to. A guessed correspondence is worse than a blank one,
// because a blank invites the work and a guess closes it.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** How a CAC dimension relates to the framework metric it points at. */
export type MapRelationship = 'same-measure' | 'contributes-to' | 'evidence-for';

export interface IqacMetricMapRow {
  id: string;
  /** The CAC dimension slug — `CacMetric.id` from cac/_lib/cac-metric-catalog.ts. */
  config_key: string;
  display_name: string;
  description: string | null;
  /** NULL on both columns together means "reviewed and deliberately left unmapped". */
  body_code: string | null;
  metric_code: string | null;
  relationship: MapRelationship;
  is_active: boolean;
}

export interface IqacMetricMapReadout {
  /**
   * False when `public.iqac_cac_metric_map` does not exist yet. Distinguishes
   * "the registry is not provisioned" from "the registry is provisioned and
   * empty" — two states that look identical in a row count and mean opposite
   * things about what to do next.
   */
  registryAvailable: boolean;
  rows: IqacMetricMapRow[];
}

/** PostgREST / PostgreSQL codes that mean the relation is not there at all. */
const MISSING_RELATION_CODES = new Set(['PGRST205', 'PGRST202', '42P01']);

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_RELATION_CODES.has(error.code)) return true;
  return /schema cache|does not exist/i.test(error.message ?? '');
}

export class IqacMetricMapService {
  static async list(): Promise<IqacMetricMapReadout> {
    const supabase = createClientSupabaseClient() as any;
    const { data, error } = await supabase
      .from('iqac_cac_metric_map')
      .select('id, config_key, display_name, description, body_code, metric_code, relationship, is_active')
      .eq('is_active', true)
      .order('config_key');

    if (error) {
      if (isMissingRelation(error)) return { registryAvailable: false, rows: [] };
      throw error;
    }

    return { registryAvailable: true, rows: (data ?? []) as IqacMetricMapRow[] };
  }
}

// ---------------------------------------------------------------------------
// Pure shaping — kept here beside the type, and free of the Supabase import at
// call time so the page and the tests can both use it.
// ---------------------------------------------------------------------------

export interface MappedTarget {
  body_code: string;
  metric_code: string;
  relationship: MapRelationship;
}

export interface CacMappingStatus {
  /** The CAC dimension slug. */
  cacMetricId: string;
  /** Framework metrics this dimension has been mapped onto. Empty means unmapped. */
  targets: MappedTarget[];
  /**
   * True when a row exists for this dimension with no target — somebody looked
   * and recorded that there is no correspondence. Different from never having
   * been looked at, and the difference is worth showing.
   */
  reviewedAsUnmapped: boolean;
}

/**
 * Index the registry rows by CAC dimension.
 *
 * A row with a body and a code is a mapping. A row with neither is a recorded
 * decision that the dimension has no counterpart in the 107. A dimension with no
 * row at all is simply unexamined — and renders as unmapped, never as mapped to
 * something plausible.
 */
export function indexMappings(
  rows: readonly IqacMetricMapRow[],
): Map<string, CacMappingStatus> {
  const byDimension = new Map<string, CacMappingStatus>();

  for (const row of rows) {
    if (!byDimension.has(row.config_key)) {
      byDimension.set(row.config_key, {
        cacMetricId: row.config_key,
        targets: [],
        reviewedAsUnmapped: false,
      });
    }
    const status = byDimension.get(row.config_key)!;

    if (row.body_code && row.metric_code) {
      status.targets.push({
        body_code: row.body_code,
        metric_code: row.metric_code,
        relationship: row.relationship,
      });
    } else {
      status.reviewedAsUnmapped = true;
    }
  }

  // A dimension carrying both a real target and an unmapped marker is mapped;
  // the marker is stale. Prefer the evidence of a mapping over its absence.
  for (const status of byDimension.values()) {
    if (status.targets.length > 0) status.reviewedAsUnmapped = false;
  }

  return byDimension;
}

export interface MappingSummary {
  /** CAC dimensions in the catalog. */
  totalDimensions: number;
  /** Dimensions with at least one framework target. */
  mapped: number;
  /** Dimensions somebody reviewed and recorded as having no counterpart. */
  reviewedAsUnmapped: number;
  /** Dimensions nobody has recorded anything about. */
  unexamined: number;
}

export function summariseMappings(
  cacMetricIds: readonly string[],
  index: ReadonlyMap<string, CacMappingStatus>,
): MappingSummary {
  let mapped = 0;
  let reviewedAsUnmapped = 0;

  for (const id of cacMetricIds) {
    const status = index.get(id);
    if (status && status.targets.length > 0) mapped += 1;
    else if (status?.reviewedAsUnmapped) reviewedAsUnmapped += 1;
  }

  return {
    totalDimensions: cacMetricIds.length,
    mapped,
    reviewedAsUnmapped,
    unexamined: cacMetricIds.length - mapped - reviewedAsUnmapped,
  };
}
