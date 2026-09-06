/**
 * Feedback Super-Cockpit — the management (super-admin) view of the whole
 * feedback spine. Reads public.feedback_events (RLS-scoped via browser client).
 *
 * Design axis (see project_feedback_spine): "show everything" for management ==
 * FULL VISIBILITY + ruthless separation of GENUINE institutional voice from
 * EXTERNAL NOISE. Most negatives are troll-storms concentrated on a single public
 * IG post — not institutional feedback. This service surfaces the genuine,
 * actionable signal first, while keeping every event explorable.
 *
 * CONTRACT FILE (types-first): function SIGNATURES + types are stable; the backend
 * lane fills the bodies, the component lanes consume the types. Do not change a
 * signature without updating both sides.
 */
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FeedbackSource, AiSentiment } from '@/lib/types/feedback-spine';

const supabase = createClientSupabaseClient();

// ─── shared ──────────────────────────────────────────────────────────────────

export interface SuperFilters {
  source: FeedbackSource | 'all';
  hideSpam: boolean;
  institutionId?: string;
}

/** Sources that ARE the institution's own captured voice (never external noise). */
export const INTERNAL_SOURCES: FeedbackSource[] = [
  'session_feedback', 'class_feedback', 'mess', 'parent', 'scf_checkin', 'ai_pulse',
];
/** Public/external surfaces that can carry troll-storms. */
export const EXTERNAL_SOURCES: FeedbackSource[] = ['ig_comment', 'ig_dm'];

/** A public target (post/reel) with at least this many negatives is treated as a
 *  likely external troll-storm, not organic institutional feedback. */
export const NOISE_NEGATIVE_THRESHOLD = 8;

/** All 8 feedback sources, in a stable order (mirrors the FeedbackSource union). */
const ALL_SOURCES: FeedbackSource[] = [
  'ig_comment', 'ig_dm', 'session_feedback', 'ai_pulse',
  'mess', 'class_feedback', 'parent', 'scf_checkin',
];

// ─── internal helpers ─────────────────────────────────────────────────────────

/** Group EXTERNAL rows by target_ref; a target whose negative count reaches
 *  NOISE_NEGATIVE_THRESHOLD is treated as an external troll-storm (noise). */
function computeTrollTargets(
  rows: Array<{ source: string | null; target_ref: string | null; ai_sentiment: string | null }>,
): Set<string> {
  const negByTarget = new Map<string, number>();
  for (const row of rows) {
    if (
      row.source &&
      (EXTERNAL_SOURCES as string[]).includes(row.source) &&
      row.target_ref &&
      row.ai_sentiment === 'negative'
    ) {
      negByTarget.set(row.target_ref, (negByTarget.get(row.target_ref) ?? 0) + 1);
    }
  }
  const troll = new Set<string>();
  for (const [target, neg] of negByTarget) {
    if (neg >= NOISE_NEGATIVE_THRESHOLD) troll.add(target);
  }
  return troll;
}

/** True when a row is an external event sitting on a detected troll-storm target. */
function isNoiseRow(
  row: { source: string | null; target_ref: string | null },
  trollTargets: Set<string>,
): boolean {
  return (
    !!row.source &&
    (EXTERNAL_SOURCES as string[]).includes(row.source) &&
    !!row.target_ref &&
    trollTargets.has(row.target_ref)
  );
}

/** Detect troll-storm targets independent of any intent filter (needed by the
 *  action queue, whose main query is already restricted to actionable intents). */
async function loadTrollTargets(filters: SuperFilters): Promise<Set<string>> {
  const rows = await selectAllFeedback<{
    source: string | null; target_ref: string | null; ai_sentiment: string | null;
  }>('source, target_ref, ai_sentiment', (q) =>
    applyFeedbackFilters(q.in('source', EXTERNAL_SOURCES), filters),
  );
  return computeTrollTargets(rows);
}

/** institution_id → institutions.name lookup (super-admin reads all rows). */
async function loadInstitutionNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('institutions').select('id, name');
  if (error) throw new Error(`loadInstitutionNames: ${error.message}`);
  const map = new Map<string, string>();
  for (const inst of data ?? []) {
    if (inst.id) map.set(inst.id as string, (inst.name as string) ?? '');
  }
  return map;
}

/** Apply the shared super-filters to a feedback_events query.
 *  hideSpam excludes ONLY rows explicitly classified as spam; NULL-intent rows
 *  (genuine but not-yet-classified voice) are KEPT. A bare `ai_intent <> 'spam'`
 *  would wrongly drop them, because `<> 'spam'` is NULL (→ false) for NULL intents. */
function applyFeedbackFilters(q: any, filters: SuperFilters): any {
  if (filters.source !== 'all') q = q.eq('source', filters.source);
  if (filters.hideSpam) q = q.or('ai_intent.neq.spam,ai_intent.is.null');
  if (filters.institutionId) q = q.eq('institution_id', filters.institutionId);
  return q;
}

/** PostgREST caps one response at ~1000 rows; these table-wide aggregations must
 *  see EVERY row or troll detection and totals silently corrupt on a truncated
 *  slice. Page through in fixed chunks until a short page marks the end. */
const PAGE_ROWS = 1000;
async function selectAllFeedback<T>(
  columns: string,
  applyFilters: (q: any) => any = (q) => q,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const base = supabase.from('feedback_events').select(columns);
    const { data, error } = await applyFilters(base).range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`selectAllFeedback: ${error.message}`);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE_ROWS) break;
  }
  return out;
}

// ─── 1. Overview (top-line management numbers) — BACKEND LANE ─────────────────

export interface SuperOverview {
  total: number;
  classified: number;
  unclassified: number;
  /** genuine = internal sources + external events NOT on a troll-storm target. */
  genuine: number;
  /** noise = ALL external events on a troll-storm target (any sentiment); the whole
   *  pile-on is external social noise, not institutional feedback. */
  noise: number;
  bySentiment: Record<AiSentiment, number>;
  bySource: Array<{ source: FeedbackSource; count: number; lastAt: string | null }>;
  institutions: number;
  needsReply: number;
}

export async function fetchSuperOverview(filters: SuperFilters): Promise<SuperOverview> {
  const rows = await selectAllFeedback<{
    ai_sentiment: string | null; ai_intent: string | null; source: string | null;
    institution_id: string | null; target_ref: string | null; occurred_at: string | null;
  }>(
    'ai_sentiment, ai_intent, source, institution_id, target_ref, occurred_at',
    (q) => applyFeedbackFilters(q, filters),
  );
  const trollTargets = computeTrollTargets(rows);

  const bySentiment: Record<AiSentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    mixed: 0,
  };
  const sourceMap = new Map<FeedbackSource, { count: number; lastAt: string | null }>();
  const institutionSet = new Set<string>();
  let classified = 0;
  let needsReply = 0;
  let noise = 0;

  for (const row of rows) {
    if (row.ai_sentiment) {
      classified++;
      if (row.ai_sentiment in bySentiment) {
        bySentiment[row.ai_sentiment as AiSentiment]++;
      }
    }
    if (row.ai_intent === 'complaint' || row.ai_intent === 'question') needsReply++;
    if (row.institution_id) institutionSet.add(row.institution_id as string);
    if (row.source) {
      const src = row.source as FeedbackSource;
      const entry = sourceMap.get(src) ?? { count: 0, lastAt: null };
      entry.count++;
      const occ = row.occurred_at as string | null;
      if (occ && (!entry.lastAt || new Date(occ) > new Date(entry.lastAt))) {
        entry.lastAt = occ;
      }
      sourceMap.set(src, entry);
    }
    if (isNoiseRow(row, trollTargets)) noise++;
  }

  const total = rows.length;
  const bySource = Array.from(sourceMap.entries())
    .map(([source, v]) => ({ source, count: v.count, lastAt: v.lastAt }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    classified,
    unclassified: total - classified,
    genuine: total - noise,
    noise,
    bySentiment,
    bySource,
    institutions: institutionSet.size,
    needsReply,
  };
}

// ─── 2. Per-institution breakdown — BACKEND LANE ─────────────────────────────

export interface InstitutionFeedbackRow {
  institution_id: string;
  institution_name: string;
  total: number;
  genuine_negative: number;
  needs_reply: number;
  positive: number;
  negative: number;
  top_theme: string | null;
}

export async function fetchInstitutionBreakdown(
  filters: SuperFilters,
): Promise<InstitutionFeedbackRow[]> {
  const rows = await selectAllFeedback<{
    institution_id: string | null; ai_sentiment: string | null; ai_intent: string | null;
    ai_topic: string | null; source: string | null; target_ref: string | null;
  }>(
    'institution_id, ai_sentiment, ai_intent, ai_topic, source, target_ref',
    (q) => applyFeedbackFilters(q, filters),
  );
  const trollTargets = computeTrollTargets(rows);
  const nameMap = await loadInstitutionNames();

  interface Acc {
    total: number;
    positive: number;
    negative: number;
    genuine_negative: number;
    needs_reply: number;
    topics: Map<string, number>;
  }
  const map = new Map<string, Acc>();

  for (const row of rows) {
    const instId = row.institution_id as string | null;
    if (!instId) continue; // breakdown is per-institution; unattributed rows are skipped
    let acc = map.get(instId);
    if (!acc) {
      acc = {
        total: 0,
        positive: 0,
        negative: 0,
        genuine_negative: 0,
        needs_reply: 0,
        topics: new Map<string, number>(),
      };
      map.set(instId, acc);
    }
    acc.total++;
    if (row.ai_sentiment === 'positive') acc.positive++;
    if (row.ai_sentiment === 'negative') {
      acc.negative++;
      if (!isNoiseRow(row, trollTargets)) acc.genuine_negative++;
    }
    if (row.ai_intent === 'complaint' || row.ai_intent === 'question') acc.needs_reply++;
    if (row.ai_topic) {
      const topic = row.ai_topic as string;
      acc.topics.set(topic, (acc.topics.get(topic) ?? 0) + 1);
    }
  }

  const result: InstitutionFeedbackRow[] = Array.from(map.entries()).map(
    ([institution_id, acc]) => {
      let top_theme: string | null = null;
      let topCount = 0;
      for (const [topic, count] of acc.topics) {
        if (count > topCount) {
          topCount = count;
          top_theme = topic;
        }
      }
      return {
        institution_id,
        institution_name: nameMap.get(institution_id) ?? 'Unknown',
        total: acc.total,
        genuine_negative: acc.genuine_negative,
        needs_reply: acc.needs_reply,
        positive: acc.positive,
        negative: acc.negative,
        top_theme,
      };
    },
  );

  return result.sort((a, b) => b.genuine_negative - a.genuine_negative);
}

// ─── 3. Action queue (genuine items needing a decision) — BACKEND LANE ────────

export interface ActionItem {
  id: string;
  source: FeedbackSource;
  institution_id: string | null;
  institution_name: string | null;
  content: string | null;
  ai_topic: string | null;
  ai_intent: string | null;
  ai_sentiment: AiSentiment | null;
  ai_draft_reply: string | null;
  occurred_at: string;
  /** priority: internal complaints rank above external, recent above old. */
  priority: number;
}

export async function fetchActionQueue(filters: SuperFilters): Promise<ActionItem[]> {
  // The actionable set (complaints/questions/requests) is small, so a single
  // fetch is fine here; the intent filter already bounds it well under the cap.
  const query = applyFeedbackFilters(
    supabase
      .from('feedback_events')
      .select(
        'id, source, institution_id, content, ai_topic, ai_intent, ai_sentiment, ai_draft_reply, target_ref, occurred_at',
      )
      .in('ai_intent', ['complaint', 'question', 'request']),
    filters,
  );

  const { data, error } = await query;
  if (error) throw new Error(`fetchActionQueue: ${error.message}`);

  const rows = data ?? [];
  // Troll targets come from a broad (all-intent) scan — the query above is already
  // intent-restricted, so it cannot see the full external storm on its own.
  const trollTargets = await loadTrollTargets(filters);

  const items: ActionItem[] = [];
  for (const row of rows) {
    if (isNoiseRow(row, trollTargets)) continue; // exclude external troll-storm noise

    const intent = row.ai_intent as string | null;
    const sentiment = row.ai_sentiment as AiSentiment | null;
    const qualifies =
      intent === 'complaint' ||
      intent === 'question' ||
      intent === 'request' ||
      sentiment === 'negative' ||
      sentiment === 'mixed';
    if (!qualifies) continue;

    const source = row.source as FeedbackSource;
    const isInternalComplaint =
      (INTERNAL_SOURCES as string[]).includes(source) && intent === 'complaint';
    // Internal complaints outrank everything; recency (ms) breaks ties within a tier.
    const occurredMs = new Date(row.occurred_at as string).getTime();
    const priority = (isInternalComplaint ? 1 : 0) * 1e15 + occurredMs;

    items.push({
      id: row.id as string,
      source,
      institution_id: (row.institution_id as string | null) ?? null,
      institution_name: null,
      content: (row.content as string | null) ?? null,
      ai_topic: (row.ai_topic as string | null) ?? null,
      ai_intent: intent,
      ai_sentiment: sentiment,
      ai_draft_reply: (row.ai_draft_reply as string | null) ?? null,
      occurred_at: row.occurred_at as string,
      priority,
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  const top = items.slice(0, 50);

  const nameMap = await loadInstitutionNames();
  for (const item of top) {
    item.institution_name = item.institution_id
      ? nameMap.get(item.institution_id) ?? null
      : null;
  }

  return top;
}

// ─── 4. Genuine-vs-noise split — BACKEND LANE ────────────────────────────────

export interface NoiseTarget {
  source: FeedbackSource;
  target_ref: string | null;
  total: number;
  negative: number;
}
export interface GenuineVsNoise {
  genuine: number;
  noise: number;
  noiseTargets: NoiseTarget[];
}

export async function fetchGenuineVsNoise(filters: SuperFilters): Promise<GenuineVsNoise> {
  const rows = await selectAllFeedback<{
    source: string | null; target_ref: string | null; ai_sentiment: string | null;
  }>('source, target_ref, ai_sentiment', (q) => applyFeedbackFilters(q, filters));
  const trollTargets = computeTrollTargets(rows);

  const targetMap = new Map<string, NoiseTarget>();
  let noise = 0;
  for (const row of rows) {
    if (!isNoiseRow(row, trollTargets)) continue;
    noise++;
    const key = row.target_ref as string;
    let entry = targetMap.get(key);
    if (!entry) {
      entry = {
        source: row.source as FeedbackSource,
        target_ref: key,
        total: 0,
        negative: 0,
      };
      targetMap.set(key, entry);
    }
    entry.total++;
    if (row.ai_sentiment === 'negative') entry.negative++;
  }

  const noiseTargets = Array.from(targetMap.values()).sort(
    (a, b) => b.negative - a.negative,
  );

  return { genuine: rows.length - noise, noise, noiseTargets };
}

// ─── 5. Source health (which of the 8 sources are flowing vs dry) — BACKEND ───

export interface SourceHealth {
  source: FeedbackSource;
  count: number;
  classified_pct: number;
  last_at: string | null;
  is_dry: boolean;
}

export async function fetchSourceHealth(): Promise<SourceHealth[]> {
  const data = await selectAllFeedback<{
    source: string | null; ai_sentiment: string | null; occurred_at: string | null;
  }>('source, ai_sentiment, occurred_at');

  interface Acc {
    count: number;
    classified: number;
    last_at: string | null;
  }
  const map = new Map<FeedbackSource, Acc>();

  for (const row of data ?? []) {
    const src = row.source as FeedbackSource | null;
    if (!src) continue;
    let acc = map.get(src);
    if (!acc) {
      acc = { count: 0, classified: 0, last_at: null };
      map.set(src, acc);
    }
    acc.count++;
    if (row.ai_sentiment) acc.classified++;
    const occ = row.occurred_at as string | null;
    if (occ && (!acc.last_at || new Date(occ) > new Date(acc.last_at))) {
      acc.last_at = occ;
    }
  }

  // Emit ALL 8 sources so zero-row (dry) sources are visible, not omitted.
  return ALL_SOURCES.map((source) => {
    const acc = map.get(source);
    const count = acc?.count ?? 0;
    const classified = acc?.classified ?? 0;
    return {
      source,
      count,
      classified_pct: count === 0 ? 0 : Math.round((classified / count) * 100),
      last_at: acc?.last_at ?? null,
      is_dry: count === 0,
    };
  });
}

// ─── 6. Full feedback explorer (searchable full event list) — BACKEND LANE ────

export interface FeedbackEventDetail {
  id: string;
  source: FeedbackSource;
  institution_id: string | null;
  actor_ref: string | null;
  content: string | null;
  rating: number | null;
  ai_sentiment: AiSentiment | null;
  ai_intent: string | null;
  ai_topic: string | null;
  ai_draft_reply: string | null;
  target_ref: string | null;
  occurred_at: string;
}

export interface ExplorerOpts {
  search?: string;
  sentiment?: AiSentiment | 'all';
  limit?: number;
  offset?: number;
}
export interface ExplorerResult {
  rows: FeedbackEventDetail[];
  total: number;
}

export async function fetchFeedbackExplorer(
  filters: SuperFilters,
  opts: ExplorerOpts,
): Promise<ExplorerResult> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  let query = supabase
    .from('feedback_events')
    .select(
      'id, source, institution_id, actor_ref, content, rating, ai_sentiment, ai_intent, ai_topic, ai_draft_reply, target_ref, occurred_at',
      { count: 'exact' },
    );

  query = applyFeedbackFilters(query, filters);
  if (opts.search) query = query.ilike('content', `%${opts.search}%`);
  if (opts.sentiment && opts.sentiment !== 'all') {
    query = query.eq('ai_sentiment', opts.sentiment);
  }

  query = query
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`fetchFeedbackExplorer: ${error.message}`);

  return {
    rows: (data ?? []) as FeedbackEventDetail[],
    total: count ?? 0,
  };
}
