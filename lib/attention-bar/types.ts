/**
 * Attention Bar — TypeScript types
 *
 * Spec: specs/attention-bar-5-layer-system.md (PR #542)
 *
 * Single attention slot above the bottom-nav strip on every page,
 * resolved through a 5-layer priority cascade: 0 → 2 → 3 → 1 → 4.
 *
 * Phase 1 ships Layer 1 (static defaults) and the resolver skeleton
 * with stubs for Layers 0/2/3/4 — those phases plug in via the same
 * resolver entry point without UI changes.
 */

export type Layer = 0 | 1 | 2 | 3 | 4;

export type Tone = 'urgent' | 'amber' | 'green' | 'blue' | 'neutral';

export interface ActionTemplate {
  /** Stable identifier for analytics + Layer 4 allowlist. */
  id: string;
  /** Headline shown in the bar. */
  label: string;
  /** Optional secondary line, italic, smaller. */
  context?: string;
  /** Visual treatment — also affects animation (urgent pulses). */
  tone: Tone;
  /** CTA button text. */
  cta: string;
  /** lucide-react icon name. */
  icon: string;
  /** Destination on tap. Internal route or absolute URL. */
  href: string;
}

export interface ResolverContext {
  userId: string;
  /** Primary role from profiles.role. Multi-role users use the highest-priority role. */
  role: string;
  /** Pathname only — no search params. */
  page: string;
  /** Pre-fetched results from quick_action_state_queries. Phase 1: always {}. */
  state: Record<string, unknown>;
  preferences: {
    /** Has user opted into Layer 3 behavioral learning? */
    layer3Consent: boolean;
    /** Per-user layer 3 toggle. 'inherit' follows org default. */
    layer3OverrideTo: 'on' | 'off' | 'inherit';
  };
  /** Set of layers active for this resolution. Empty for full resolution. */
  enabledLayers: Set<Layer>;
}

export interface TraceEntry {
  layer: Layer;
  ruleId?: string;
  /**
   * Outcome at this layer:
   * - 'matched'        → this layer fired, resolver returns
   * - 'no-match'       → layer evaluated cleanly, no candidate
   * - 'skipped'        → layer disabled via config or per-user
   * - 'error'          → layer threw; fall through to next
   */
  result: 'matched' | 'no-match' | 'skipped' | 'error';
  reason?: string;
}

export interface ResolvedAction extends ActionTemplate {
  firedLayer: Layer;
  /** Set when firedLayer === 2. */
  ruleId?: string;
  /** Full per-layer evaluation log; written to quick_action_audit. */
  trace: TraceEntry[];
}

/**
 * Layer 1 registry entry.
 *
 * Layer 1 lives in code (not DB) because:
 *  - Changes must pass code review.
 *  - Coverage is part of the page contract — orphan pages are visible at compile-time.
 *  - DB-backed Layer 1 invites unbounded sprawl; we want it small + curated.
 *
 * The factory shape `(ctx) => ActionTemplate` mirrors Layer 2's action_template.
 * Most Layer 1 entries don't read from ctx, but allowing the function shape lets
 * a default greet by name ("Resume work, {ctx.userId}") without a separate API.
 */
export interface StaticDefault {
  /** '/admission/leads' or '*' (only used for catch-all defaults). */
  page: string;
  /** 'counselor' or '*' (catch-all). Specific role wins over '*'. */
  role: string;
  /** Builds the action from context. */
  build: (ctx: ResolverContext) => ActionTemplate;
}

/**
 * State query registry entry.
 *
 * Phase 1 ships an empty registry. Phase 4 (Layer 2 rules engine) populates it
 * with named queries like `counselor.pending_leads`, `attendance.unmarked_periods_today`.
 *
 * Each entry maps a logical key to a SECURITY DEFINER SQL function. The indirection
 * means rule editors don't need SQL access — they reference the key, not the SQL.
 */
export interface StateQueryDescriptor {
  key: string;
  description: string;
  sqlFunctionName: string;
  /** JSON-shape contract for what the query returns. */
  returnShape: Record<string, unknown>;
  rateLimitPerMinute: number;
}

/**
 * Output of `resolve()` — bundle that supports the 2-half split layout.
 *
 * Framework seam (added 2026-04-28): the bar can render two side-by-side pills
 * when both `primary` and `secondary` are non-null. Until follow-up resolver
 * work populates `secondary`, only `primary` is computed and `secondary` stays
 * null — the renderer falls back to the single full-width pill (current
 * production behaviour, unchanged).
 *
 * Fields:
 *   - `primary`   — the resolved action from the priority cascade (0→2→3→1→4).
 *                   Null only on a truly catastrophic empty cascade.
 *   - `secondary` — the second action for the right half of the split bar.
 *                   Always null in this PR; populated in a follow-up.
 *   - `resolved`  — backcompat alias for `primary`. Existing consumers
 *                   (e.g. tab-sandbox, the hook) read `resolved`; new consumers
 *                   should read `primary`. Keep both in sync.
 */
export interface ResolveResult {
  /** Backcompat alias = primary. Existing consumers may keep reading this. */
  resolved: ResolvedAction | null;
  /** Layer-cascade winner for the LEFT (or full-width) pill. */
  primary: ResolvedAction | null;
  /** RIGHT-pill action. Null until the follow-up resolver populates it. */
  secondary: ResolvedAction | null;
}
