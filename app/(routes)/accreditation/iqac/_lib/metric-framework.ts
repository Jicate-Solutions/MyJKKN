// app/(routes)/accreditation/iqac/_lib/metric-framework.ts
// ============================================================================
// The 107-row master accreditation framework, as shape rather than as rows.
//
// Director's locked decision, 2026-08-01: the 107 rows in
// `public.sh_accreditation_metrics` ARE the master accreditation framework. The
// CEO's 48 CAC dimensions (app/(routes)/accreditation/cac/_lib/cac-metric-catalog.ts)
// become a summary view on top of it, not a rival list.
//
// This module holds the part of that decision a test can hold onto: how the 107
// are grouped, and the guarantee that grouping them loses none of them.
//
// ----------------------------------------------------------------------------
// THE TRAP THIS FILE EXISTS TO DEFUSE
// ----------------------------------------------------------------------------
// `category` on that table is FREE TEXT, and production carries two attributes
// spelled two ways each (verified live 2026-08-01):
//
//     'Attribute 10: Sustainability'                    ×1
//     'Attribute 10: Sustainability & Green Initiatives' ×4
//     'Attribute 9: Research'                            ×1
//     'Attribute 9: Research & Innovation Outcomes'      ×7
//
// Grouping on the raw string yields 12 NAAC sections where the framework has 10,
// with Attribute 9 and Attribute 10 each appearing twice and each showing a
// partial metric list. A reader would take the short section for the whole
// attribute — the metrics are not missing from the page, they are filed under a
// heading that looks complete and is not.
//
// So the grouping key is the `Attribute N:` prefix, never the free-text tail.
//
// And the variants are NOT hidden. `variants` on every group carries every raw
// spelling with its row count, and `hasVariantConflict` marks the groups where
// more than one spelling is in play, so the page can show a data owner exactly
// which strings to reconcile. Silently choosing one spelling would repair the
// screen and leave the database wrong — and would make the wrongness harder to
// find next time, not easier.
//
// ----------------------------------------------------------------------------
// WHY THE KEY IS NOT UNIVERSAL
// ----------------------------------------------------------------------------
// Only NAAC numbers its categories. The other nine bodies use bare labels —
// 'TLR', 'GO', 'RPC', 'OI', 'PR' (NIRF); 'Tier 1', 'Tier 2' (NBA); 'Faculty',
// 'Clinical', 'Approval', 'Safety', 'Reputation', 'Research', 'Infrastructure',
// 'Training', 'Welfare & Student Support'. A key that assumed `Attribute N:`
// would collapse all of those into one bucket. So a category with no attribute
// prefix keys on its own normalised text, which for those bodies is exact.
//
// Note that 'Faculty' occurs under DCI, INC, NCTE and PCI. Grouping is by BODY
// first and category second, so those four never meet.
//
// Pure and dependency-free on purpose: the page imports the Supabase browser
// client at module scope, which cannot load under vitest. Same reason
// cac/_lib/cluster-scope.ts and cac/_lib/cac-metric-catalog.ts sit apart from
// their page.
// ============================================================================

/** One row of `public.sh_accreditation_metrics`, as this screen reads it. */
export interface FrameworkMetricRow {
  /** The awarding body. The column is `metric_type` — there is no `accreditation_body` column. */
  metric_type: string;
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  weightage: number | null;
}

/**
 * Body display order. The ten outside bodies, heaviest first by row count, which
 * is also roughly the order in which JKKN is inspected.
 *
 * A body absent from this list still renders — it sorts after the known ones,
 * alphabetically. A new body appearing in the data must never disappear from the
 * page merely because nobody updated a constant here.
 */
export const BODY_ORDER: readonly string[] = [
  'NAAC',
  'NIRF',
  'NBA',
  'DCI',
  'PCI',
  'INC',
  'QS',
  'UGC',
  'AICTE',
  'NCTE',
];

/** Matches the numbered-attribute prefix NAAC categories carry. */
const ATTRIBUTE_PREFIX = /^\s*attribute\s+(\d+)\s*:/i;

/** Key used for rows whose category is null or blank. */
export const UNCATEGORISED_KEY = '__uncategorised__';

/**
 * The canonical grouping key for a raw category string.
 *
 * 'Attribute 10: Sustainability'                     -> 'attribute-10'
 * 'Attribute 10: Sustainability & Green Initiatives' -> 'attribute-10'
 * 'Tier 1'                                           -> 'tier 1'
 * null / ''                                          -> UNCATEGORISED_KEY
 */
export function categoryKey(category: string | null | undefined): string {
  const raw = (category ?? '').trim();
  if (raw === '') return UNCATEGORISED_KEY;

  const attribute = ATTRIBUTE_PREFIX.exec(raw);
  if (attribute) return `attribute-${Number(attribute[1])}`;

  return raw.toLowerCase().replace(/\s+/g, ' ');
}

/** The attribute number a category carries, or null when it carries none. */
export function attributeNumber(category: string | null | undefined): number | null {
  const attribute = ATTRIBUTE_PREFIX.exec((category ?? '').trim());
  return attribute ? Number(attribute[1]) : null;
}

/** One raw spelling of a category, and how many rows use it. */
export interface CategoryVariant {
  raw: string | null;
  count: number;
}

export interface CategoryGroup {
  key: string;
  /**
   * The heading shown on screen. Where a group has more than one raw spelling,
   * this is the LONGEST one — the fuller phrasing is the one that describes the
   * attribute rather than abbreviating it ('Attribute 9: Research & Innovation
   * Outcomes' over 'Attribute 9: Research'). Ties break alphabetically so the
   * choice is deterministic across renders.
   *
   * Choosing a label is a display decision only. Nothing here edits the data,
   * and `variants` keeps every spelling visible.
   */
  label: string;
  attribute: number | null;
  variants: CategoryVariant[];
  /** True when the same attribute is spelled more than one way in the data. */
  hasVariantConflict: boolean;
  metrics: FrameworkMetricRow[];
}

export interface BodyGroup {
  body: string;
  metricCount: number;
  categories: CategoryGroup[];
}

export interface FrameworkGrouping {
  bodies: BodyGroup[];
  /** Rows handed in. */
  total: number;
  /** Rows placed into a group. Must equal `total` — see `isComplete`. */
  accountedFor: number;
  /**
   * The accounting guarantee, computed rather than asserted: every row handed in
   * came out inside exactly one group. The page renders this, so a future change
   * that drops rows announces itself on screen instead of quietly shrinking a
   * count nobody was watching.
   */
  isComplete: boolean;
  /** Every group where one attribute is spelled more than one way. */
  conflicts: { body: string; label: string; variants: CategoryVariant[] }[];
}

function labelFor(variants: CategoryVariant[]): string {
  const named = variants
    .map((v) => v.raw)
    .filter((raw): raw is string => !!raw && raw.trim() !== '');
  if (named.length === 0) return 'Uncategorised';
  return named.slice().sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
}

function bodyRank(body: string): number {
  const at = BODY_ORDER.indexOf(body);
  return at === -1 ? BODY_ORDER.length : at;
}

/**
 * Group the framework by body, then by NORMALISED category.
 *
 * Rows are never dropped, deduplicated or reordered inside a group beyond a
 * stable sort on metric_code — a metric that vanished from this output would be
 * a metric the institution stops being asked about.
 */
export function groupFramework(rows: readonly FrameworkMetricRow[]): FrameworkGrouping {
  const byBody = new Map<string, Map<string, CategoryGroup>>();
  const variantCounts = new Map<string, Map<string, Map<string, number>>>();

  for (const row of rows) {
    const body = (row.metric_type ?? '').trim() || 'Unassigned';
    const key = categoryKey(row.category);

    if (!byBody.has(body)) byBody.set(body, new Map());
    if (!variantCounts.has(body)) variantCounts.set(body, new Map());

    const categories = byBody.get(body)!;
    if (!categories.has(key)) {
      categories.set(key, {
        key,
        label: '',
        attribute: attributeNumber(row.category),
        variants: [],
        hasVariantConflict: false,
        metrics: [],
      });
    }
    categories.get(key)!.metrics.push(row);

    // Count raw spellings. A null and an empty string are the same absence, so
    // they share one bucket rather than reading as two competing spellings.
    const perCategory = variantCounts.get(body)!;
    if (!perCategory.has(key)) perCategory.set(key, new Map());
    const rawLabel = (row.category ?? '').trim();
    const bucket = perCategory.get(key)!;
    bucket.set(rawLabel, (bucket.get(rawLabel) ?? 0) + 1);
  }

  const conflicts: FrameworkGrouping['conflicts'] = [];
  let accountedFor = 0;

  const bodies: BodyGroup[] = [...byBody.entries()]
    .map(([body, categories]) => {
      const groups = [...categories.values()].map((group) => {
        const bucket = variantCounts.get(body)!.get(group.key)!;
        const variants: CategoryVariant[] = [...bucket.entries()]
          .map(([raw, count]) => ({ raw: raw === '' ? null : raw, count }))
          .sort((a, b) => b.count - a.count || (a.raw ?? '').localeCompare(b.raw ?? ''));

        const resolved: CategoryGroup = {
          ...group,
          label: labelFor(variants),
          variants,
          hasVariantConflict: variants.length > 1,
          metrics: group.metrics
            .slice()
            .sort((a, b) => a.metric_code.localeCompare(b.metric_code)),
        };

        accountedFor += resolved.metrics.length;
        if (resolved.hasVariantConflict) {
          conflicts.push({ body, label: resolved.label, variants });
        }
        return resolved;
      });

      // Numbered attributes in numeric order first; then bare labels A–Z. A
      // string sort would put Attribute 10 between 1 and 2.
      groups.sort((a, b) => {
        if (a.attribute !== null && b.attribute !== null) return a.attribute - b.attribute;
        if (a.attribute !== null) return -1;
        if (b.attribute !== null) return 1;
        return a.label.localeCompare(b.label);
      });

      return {
        body,
        metricCount: groups.reduce((sum, g) => sum + g.metrics.length, 0),
        categories: groups,
      };
    })
    .sort((a, b) => bodyRank(a.body) - bodyRank(b.body) || a.body.localeCompare(b.body));

  return {
    bodies,
    total: rows.length,
    accountedFor,
    isComplete: accountedFor === rows.length,
    conflicts,
  };
}

/**
 * Whether the platform can currently answer a metric.
 *
 * `measured`          — at least one evidence record is filed against it.
 * `not-captured-yet`  — nothing is filed. Never rendered as 0: a zero reads as a
 *                       measured value of nought, which is a different and much
 *                       worse claim than "we do not capture this".
 *
 * This is the same discipline the CAC dashboard already applies to the CEO's 48.
 */
export type MeasurementState = 'measured' | 'not-captured-yet';

export function measurementState(evidenceCount: number | undefined): MeasurementState {
  return (evidenceCount ?? 0) > 0 ? 'measured' : 'not-captured-yet';
}

/** Stable key into an evidence-count map. Body and code together, since metric_code repeats across bodies. */
export function evidenceKey(body: string, metricCode: string): string {
  return `${body}::${metricCode}`;
}

export interface FrameworkCoverage {
  total: number;
  measured: number;
  notCapturedYet: number;
}

/**
 * How much of the framework the platform can currently answer.
 *
 * Deliberately NOT a grade, a score or a percentage of a maximum. It is a count
 * of metrics with evidence against a count without — the same decision the CAC
 * dashboard made, and for the same reason: a number that looks like a rating
 * invites the reader to treat it as one, and no outside body has awarded JKKN
 * anything on this page.
 */
export function summariseCoverage(
  rows: readonly FrameworkMetricRow[],
  evidenceCounts: Readonly<Record<string, number>>,
): FrameworkCoverage {
  let measured = 0;
  for (const row of rows) {
    if (measurementState(evidenceCounts[evidenceKey(row.metric_type, row.metric_code)]) === 'measured') {
      measured += 1;
    }
  }
  return { total: rows.length, measured, notCapturedYet: rows.length - measured };
}
