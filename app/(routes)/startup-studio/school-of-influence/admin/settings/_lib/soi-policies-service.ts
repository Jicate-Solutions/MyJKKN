'use client';

/**
 * School of Influence — settings service (S2)
 * ============================================================================
 * Spec: specs/school-of-influence-batches-2026-07-30.md §4, §7 (S2).
 *
 * READS AND WRITES THE EXISTING SUBSTRATE. There is no soi_* config table and
 * no new RPC. Everything here is `public.platform_policies` at
 * `scope_type='cohort'`, seeded by S1 (PR #2679, branch feat/soi-config-substrate):
 *
 *   scope_id IS NULL   → the PROGRAMME-WIDE default for every batch
 *   scope_id = cohorts.id → that ONE batch's override, which shadows the default
 *
 * That precedence is not invented here — S1's migration
 * `20260731180000_platform_policies_cohort_scope.sql` taught `fn_get_policy`
 * to resolve `user > cohort(scope_id) > institution > role > cohort(default) >
 * global`. This editor is the write side of exactly that ladder, so what a
 * Director sees on screen is what the runtime resolver will return.
 *
 * WHY THIS FILE LIVES UNDER THE PAGE, NOT lib/services/school-of-influence/
 * §7 assigns `lib/services/school-of-influence/**` to section S3 (batches on the
 * spine). S2 owns only its own route, so the settings data layer is colocated
 * to keep the two sections' file ownership disjoint.
 *
 * GENERIC OVER THE ROW, NOT OVER A KEY LIST
 * No `soi.*` key is named anywhere in this file or in the components. Widgets,
 * options, categories, the English consequence and the cascade are all read from
 * the row's own columns (`ui_widget`, `ui_options`, `enum_options`,
 * `ui_category`, `ui_consequence`, `ui_cascade`, `validation_schema`). Adding a
 * 16th policy row in SQL makes it appear in this editor with no code change —
 * which is the whole point of the config-table pattern
 * (docs/architecture/config-table-pattern.md).
 *
 * DRAFT / PUBLISH
 * `classification` decides the write path, per spec §7 ("where the row's
 * classification calls for it"):
 *   operational → the edit lands on `value` and is live immediately
 *   major       → the edit lands on `draft_value` + `publication_state`
 *                 'draft_pending'; a second, explicit Publish copies it to
 *                 `value` and stamps `published_at` / `published_by`.
 * All 15 seeded rows are 'operational' today. The 'major' path is implemented
 * anyway because S1's seed documents flipping `soi.inactivity.enabled` to
 * 'major' as a one-line follow-up, and a UI that silently ignored the flip
 * would be the "claims to gate, actually doesn't" failure spec §5 forbids.
 *
 * VALIDATION IS THE DATABASE'S JOB
 * S1 installs `trg_guard_soi_policy_thresholds` (nudge < pause < remove,
 * 0 < completion% <= 100, capacity >= 1) as an AFTER ROW trigger resolving
 * EFFECTIVE values, so a per-batch override cannot sit under a programme-wide
 * default unnoticed. This service therefore does NOT re-implement those rules —
 * it surfaces the database's own message verbatim, which is written for a human
 * to read. Note the guard inspects `value`, so a 'major' row is validated when
 * it is PUBLISHED rather than when the draft is saved.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ---------------------------------------------------------------------------
// Constants — the substrate coordinates, not a key list.
// ---------------------------------------------------------------------------

/** Namespace every School of Influence policy row shares. */
export const SOI_POLICY_PREFIX = 'soi.';

/** platform_policies.scope_type these rows live at (added by S1's P1 migration). */
export const SOI_POLICY_SCOPE_TYPE = 'cohort';

/** cohorts.kind that identifies a School of Influence batch (created by S3). */
export const SOI_COHORT_KIND = 'school_of_influence';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type SoiWidgetKind =
  | 'number'
  | 'dropdown'
  | 'toggle'
  | 'multi_select'
  | 'textarea'
  | 'text'
  | 'json';

export type SoiSeverity = 'low' | 'medium' | 'high';

export interface SoiCascadeEntry {
  effect: string;
  severity: SoiSeverity;
}

export interface SoiOption {
  value: string;
  label: string;
}

export type SoiClassification = 'operational' | 'major';
export type SoiPublicationState = 'draft_only' | 'published' | 'draft_pending';

/** One raw `platform_policies` row at scope_type='cohort'. */
export interface SoiPolicyRow {
  id: string;
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  draft_value: unknown | null;
  description: string | null;
  data_type: string;
  enum_options: string[] | null;
  ui_options: SoiOption[] | null;
  validation_schema: Record<string, unknown> | null;
  ui_widget: string | null;
  ui_category: string | null;
  ui_consequence: string | null;
  ui_cascade: SoiCascadeEntry[] | null;
  classification: SoiClassification | null;
  publication_state: SoiPublicationState | null;
  published_at: string | null;
  is_active: boolean;
}

/**
 * One policy key resolved for the scope the Director is currently editing.
 * `defaultRow` is always present (it is what S1 seeds); `overrideRow` exists
 * only once this batch has been tuned away from the programme default.
 */
export interface SoiPolicyView {
  policyKey: string;
  defaultRow: SoiPolicyRow;
  overrideRow: SoiPolicyRow | null;
  /** The row the editor writes to. Null at batch scope until an override is created. */
  editableRow: SoiPolicyRow | null;
  /** The published value in force at this scope right now. */
  effectiveValue: unknown;
  /** An unpublished edit awaiting Publish, if any. */
  pendingDraftValue: unknown | null;
  hasPendingDraft: boolean;
  isOverridden: boolean;
}

/** A School of Influence batch (a `cohorts` row created by section S3). */
export interface SoiBatch {
  id: string;
  name: string;
  status: string | null;
}

/** Which scope the editor is pointed at. */
export type SoiScope =
  | { kind: 'programme' }
  | { kind: 'batch'; cohortId: string };

const SELECT_COLUMNS =
  'id, policy_key, scope_type, scope_id, value, draft_value, description, ' +
  'data_type, enum_options, ui_options, validation_schema, ui_widget, ' +
  'ui_category, ui_consequence, ui_cascade, classification, ' +
  'publication_state, published_at, is_active';

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Map a stored `ui_widget` token to the widget the repo actually renders.
 *
 * Necessary, not cosmetic: S1's seed writes `'multi-select'` (hyphen) for the
 * eligible-audiences row, while the shared widget dispatcher every other policy
 * editor uses switches on `'multi_select'` (underscore). Verified against
 * `20260731180200_seed_school_of_influence_policies.sql` on branch
 * feat/soi-config-substrate. Without this normalisation that one row would fall
 * through to "unsupported widget" and be uneditable — a silent hole in a
 * 15-row editor. Both spellings are accepted so neither side has to change.
 */
export function normaliseWidget(raw: string | null): SoiWidgetKind | null {
  if (!raw) return null;
  const token = raw.trim().toLowerCase().replace(/-/g, '_');
  switch (token) {
    case 'number':
    case 'dropdown':
    case 'toggle':
    case 'multi_select':
    case 'textarea':
    case 'text':
    case 'json':
      return token;
    case 'select':
      return 'dropdown';
    case 'boolean':
    case 'switch':
      return 'toggle';
    default:
      return null;
  }
}

/**
 * Options for a picker widget. Prefers `ui_options` (which carries the
 * plain-English label a Director reads); falls back to `enum_options`, where
 * the raw stored token is all we have.
 */
export function resolveOptions(row: SoiPolicyRow): SoiOption[] {
  if (Array.isArray(row.ui_options) && row.ui_options.length > 0) {
    return row.ui_options.filter(
      (o): o is SoiOption => !!o && typeof o.value === 'string' && o.value.length > 0
    );
  }
  if (Array.isArray(row.enum_options)) {
    return row.enum_options
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((v) => ({ value: v, label: v }));
  }
  return [];
}

/** True when the widget hands back a string that must be parsed as JSON. */
export function widgetEmitsJsonText(row: SoiPolicyRow): boolean {
  const widget = normaliseWidget(row.ui_widget);
  return (
    (widget === 'json' || widget === 'textarea') &&
    (row.data_type === 'object' || row.data_type === 'array')
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SoiPoliciesService {
  private static supabase = createClientSupabaseClient();

  /**
   * Every `soi.*` row at cohort scope — the programme-wide defaults AND every
   * batch override — in ONE query. Both halves are needed on screen at once:
   * a batch view has to show what it inherits as well as what it overrides.
   */
  static async listRows(): Promise<SoiPolicyRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .select(SELECT_COLUMNS)
      .eq('scope_type', SOI_POLICY_SCOPE_TYPE)
      .like('policy_key', `${SOI_POLICY_PREFIX}%`)
      .order('ui_category', { ascending: true })
      .order('policy_key', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as SoiPolicyRow[];
  }

  /**
   * The batches these settings can be tuned per. Owned by section S3 — until it
   * lands there are simply no rows, and the editor stays on the programme-wide
   * default (which is the correct behaviour, not an error).
   */
  static async listBatches(): Promise<SoiBatch[]> {
    const { data, error } = await (this.supabase as any)
      .from('cohorts')
      .select('id, name, status')
      .eq('kind', SOI_COHORT_KIND)
      .is('archived_at', null)
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as SoiBatch[];
  }

  private static async currentUserId(): Promise<string | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user?.id ?? null;
  }

  /**
   * Turn an RLS refusal into a sentence instead of a shrug.
   *
   * `platform_policies` write policies are `is_super_admin() OR is_admin()`,
   * while this page is opened by whoever holds
   * `startup_studio.school_of_influence.configure`. Those two sets are not
   * identical, so a non-admin key holder can reach the editor and be refused by
   * the database. PostgREST reports that refusal as SUCCESS WITH ZERO ROWS, not
   * as an error — click Save, see no error, and nothing has changed. That is
   * precisely the silent failure CLAUDE.md rule 27 forbids.
   *
   * So every write below chains `.select('id')` and comes through here: rows
   * back means it landed, no rows back means it was refused, and the Director
   * is told which.
   */
  private static assertWriteLanded(rows: unknown, action: string): void {
    if (Array.isArray(rows) && rows.length > 0) return;
    throw new Error(
      `You do not have permission to ${action}. The change was not saved. ` +
        'Editing these settings requires an administrator account — ask a super ' +
        'administrator to make the change, or to grant you administrator access.'
    );
  }

  /**
   * Write a value at the requested scope.
   *
   * Three cases, in the order they are checked:
   *   1. programme scope           → UPDATE the seeded default row
   *   2. batch scope, override set → UPDATE that override row
   *   3. batch scope, no override  → INSERT one, cloning every piece of the
   *      default's Director-facing metadata so the new row renders identically
   *      and stays editable here. `is_system` is deliberately left at its
   *      column default: an override created by a human is not system data.
   *
   * `classification` picks the column. 'major' parks the edit in `draft_value`
   * and flips `publication_state` to 'draft_pending' — nothing changes for the
   * runtime until Publish. Anything else writes `value` and is live at once.
   */
  static async saveValue(args: {
    view: SoiPolicyView;
    scope: SoiScope;
    nextValue: unknown;
  }): Promise<void> {
    const { view, scope, nextValue } = args;
    const target = view.editableRow;
    const userId = await this.currentUserId();
    const isMajor = (view.defaultRow.classification ?? 'operational') === 'major';
    const now = new Date().toISOString();

    const valueColumns = isMajor
      ? { draft_value: nextValue as any, publication_state: 'draft_pending' }
      : { value: nextValue as any };

    if (target) {
      const { data, error } = await (this.supabase as any)
        .from('platform_policies')
        .update({ ...valueColumns, updated_by: userId, updated_at: now })
        .eq('id', target.id)
        .select('id');
      if (error) throw new Error(error.message);
      this.assertWriteLanded(data, 'change this setting');
      return;
    }

    if (scope.kind !== 'batch') {
      // Unreachable: the programme default always exists once S1 is applied.
      throw new Error(
        'No programme-wide row to write. Apply the School of Influencer config ' +
          'migrations (S1) before editing these settings.'
      );
    }

    const base = view.defaultRow;
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .insert({
        policy_key: base.policy_key,
        scope_type: SOI_POLICY_SCOPE_TYPE,
        scope_id: scope.cohortId,
        // A draft-only override must still satisfy the NOT NULL on `value`;
        // seed it from the default so the batch behaves exactly as before
        // until the draft is published.
        value: (isMajor ? base.value : nextValue) as any,
        ...(isMajor ? { draft_value: nextValue as any, publication_state: 'draft_pending' } : {}),
        description: base.description,
        data_type: base.data_type,
        enum_options: base.enum_options as any,
        ui_options: base.ui_options as any,
        validation_schema: base.validation_schema as any,
        classification: base.classification ?? 'operational',
        ui_widget: base.ui_widget,
        ui_category: base.ui_category,
        ui_consequence: base.ui_consequence,
        ui_cascade: base.ui_cascade as any,
        is_active: true,
        updated_by: userId,
        updated_at: now,
      })
      .select('id');
    if (error) throw new Error(error.message);
    this.assertWriteLanded(data, 'set this value for one batch');
  }

  /** Copy a pending draft onto the live value and stamp the publication audit columns. */
  static async publishDraft(rowId: string, draftValue: unknown): Promise<void> {
    const userId = await this.currentUserId();
    const now = new Date().toISOString();
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .update({
        value: draftValue as any,
        draft_value: null,
        publication_state: 'published',
        published_at: now,
        published_by: userId,
        updated_by: userId,
        updated_at: now,
      })
      .eq('id', rowId)
      .select('id');
    if (error) throw new Error(error.message);
    this.assertWriteLanded(data, 'publish this setting');
  }

  /** Throw away an unpublished edit; the live value is untouched. */
  static async discardDraft(rowId: string): Promise<void> {
    const userId = await this.currentUserId();
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .update({
        draft_value: null,
        publication_state: 'published',
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rowId)
      .select('id');
    if (error) throw new Error(error.message);
    this.assertWriteLanded(data, 'discard this draft');
  }

  /**
   * Delete a batch override so the batch falls back to the programme-wide
   * default. Only ever called with an override row's id — the programme
   * default is never deletable from this screen.
   */
  static async removeOverride(rowId: string): Promise<void> {
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .delete()
      .eq('id', rowId)
      .select('id');
    if (error) throw new Error(error.message);
    this.assertWriteLanded(data, 'put this batch back on the programme-wide value');
  }
}

// ---------------------------------------------------------------------------
// Projection: raw rows + chosen scope -> what the editor renders
// ---------------------------------------------------------------------------

/**
 * Fold the raw rows into one view per policy key for the chosen scope.
 *
 * Rows whose key has no programme-wide default are dropped on purpose: an
 * orphan override cannot be explained to a Director ("compared to what?") and
 * cannot exist if S1 was applied. Dropping is safer than rendering a card whose
 * inheritance story is unknown.
 */
export function projectViews(rows: SoiPolicyRow[], scope: SoiScope): SoiPolicyView[] {
  const defaults = new Map<string, SoiPolicyRow>();
  const overrides = new Map<string, SoiPolicyRow>();

  for (const row of rows) {
    if (row.scope_id === null) {
      defaults.set(row.policy_key, row);
    } else if (scope.kind === 'batch' && row.scope_id === scope.cohortId) {
      overrides.set(row.policy_key, row);
    }
  }

  const views: SoiPolicyView[] = [];
  for (const [policyKey, defaultRow] of defaults) {
    const overrideRow = scope.kind === 'batch' ? (overrides.get(policyKey) ?? null) : null;
    const editableRow = scope.kind === 'batch' ? overrideRow : defaultRow;
    const live = overrideRow ?? defaultRow;
    const pendingDraftValue = editableRow?.draft_value ?? null;
    views.push({
      policyKey,
      defaultRow,
      overrideRow,
      editableRow,
      effectiveValue: live.value,
      pendingDraftValue,
      hasPendingDraft:
        !!editableRow &&
        editableRow.publication_state === 'draft_pending' &&
        editableRow.draft_value !== null,
      isOverridden: overrideRow !== null,
    });
  }

  return views.sort(
    (a, b) =>
      (a.defaultRow.ui_category ?? '').localeCompare(b.defaultRow.ui_category ?? '') ||
      a.policyKey.localeCompare(b.policyKey)
  );
}

/** How many of these settings are overridden at the currently-selected batch. */
export function countOverrides(views: SoiPolicyView[]): number {
  return views.filter((v) => v.isOverridden).length;
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

const SOI_POLICIES_KEY = ['startup-studio', 'school-of-influence', 'policies'] as const;
const SOI_BATCHES_KEY = ['startup-studio', 'school-of-influence', 'batches'] as const;

export function useSoiPolicyRows() {
  return useQuery({
    queryKey: SOI_POLICIES_KEY,
    queryFn: () => SoiPoliciesService.listRows(),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useSoiBatches() {
  return useQuery({
    queryKey: SOI_BATCHES_KEY,
    queryFn: () => SoiPoliciesService.listBatches(),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useSaveSoiPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { view: SoiPolicyView; scope: SoiScope; nextValue: unknown }) =>
      SoiPoliciesService.saveValue(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOI_POLICIES_KEY }),
  });
}

export function usePublishSoiDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { rowId: string; draftValue: unknown }) =>
      SoiPoliciesService.publishDraft(args.rowId, args.draftValue),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOI_POLICIES_KEY }),
  });
}

export function useDiscardSoiDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => SoiPoliciesService.discardDraft(rowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOI_POLICIES_KEY }),
  });
}

export function useRemoveSoiOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => SoiPoliciesService.removeOverride(rowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOI_POLICIES_KEY }),
  });
}
