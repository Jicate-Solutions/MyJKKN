/**
 * PDE Demonstration Service
 * ============================================================================
 *
 * Server-side CRUD over `public.pde_demonstrations` (migration
 * `20260518_pde_demonstrations_table.sql`). RLS already enforces the safety
 * envelope (learner reads/writes own; faculty/hod/coordinator/dean read same
 * institution; super_admin all), so service methods are intentionally thin —
 * they trust auth.uid() resolution at the DB layer.
 *
 * Companion file: `lib/services/pde-policy-reader.ts` (typed accessors over
 * the 20 platform_policies rows + 13 rubric rows). This service is the row-
 * writer; the policy reader is the rubric/threshold reader. They join only at
 * `listRubricsForCategory()`, which the submission form uses to populate the
 * "which rubric does this evidence map to" dropdown.
 *
 * Pattern note — class with static methods, mirrors `lib/services/pde-service.ts`
 * (1370 LOC). All Supabase calls go through the SSR `createClient()` (not the
 * client-side `createClientSupabaseClient`) because every consumer of this
 * service today runs in a server component, API route, or server action.
 *
 * Phase: PDE Tier 1.1 (learner submission UI) — 2026-05-19.
 */

import { createClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';
import type {
  CreatePDEDemonstrationInput,
  PDECategoryKey,
  PDEDemonstration,
} from '@/lib/types/pde-demonstrations';

// ---------------------------------------------------------------------------
// Category → rubric-namespace map. Only three categories have rubrics seeded
// in platform_policies today (embodied / social_leadership / cultural_civic).
// Other categories return an empty array — the submission form treats them as
// "free-form, no rubric required".
// ---------------------------------------------------------------------------
const CATEGORY_RUBRIC_KEYS: Record<PDECategoryKey, readonly string[]> = {
  embodied: [
    POLICY_KEYS.PDE_RUBRICS_EMBODIED_MEDICAL,
    POLICY_KEYS.PDE_RUBRICS_EMBODIED_PHARMACY,
    POLICY_KEYS.PDE_RUBRICS_EMBODIED_NURSING,
    POLICY_KEYS.PDE_RUBRICS_EMBODIED_DENTAL,
    POLICY_KEYS.PDE_RUBRICS_EMBODIED_ENGINEERING,
  ],
  social_leadership: [
    POLICY_KEYS.PDE_RUBRICS_SOCIAL_LEADERSHIP_PEER_MENTOR,
    POLICY_KEYS.PDE_RUBRICS_SOCIAL_LEADERSHIP_TEAM_PROJECT_LEAD,
    POLICY_KEYS.PDE_RUBRICS_SOCIAL_LEADERSHIP_COMMITTEE_ROLE,
    POLICY_KEYS.PDE_RUBRICS_SOCIAL_LEADERSHIP_COMMUNITY_ORGANIZER,
  ],
  cultural_civic: [
    POLICY_KEYS.PDE_RUBRICS_CULTURAL_CIVIC_INDIAN_LANGUAGE_PROFICIENCY,
    POLICY_KEYS.PDE_RUBRICS_CULTURAL_CIVIC_LOCAL_COMMUNITY_PROJECT,
    POLICY_KEYS.PDE_RUBRICS_CULTURAL_CIVIC_TRADITION_ATTUNEMENT,
    POLICY_KEYS.PDE_RUBRICS_CULTURAL_CIVIC_CIVIC_ENGAGEMENT,
  ],
  judgment: [],
  problem_finding: [],
  accountability: [],
  credential: [],
};

export interface RubricChoice {
  key: string;
  value: Record<string, unknown>;
}

export class PDEDemonstrationService {
  /**
   * Returns demonstrations owned by the current auth user. RLS filters to
   * `learner_id = auth.uid()` automatically — no WHERE clause needed.
   */
  static async listMine(): Promise<PDEDemonstration[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pde_demonstrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`PDEDemonstrationService.listMine failed: ${error.message}`);
    }
    return (data ?? []) as unknown as PDEDemonstration[];
  }

  /**
   * Single row by ID. Returns null if not found OR RLS-hidden — caller can't
   * distinguish (intentional; matches Supabase RLS shape).
   */
  static async getById(id: string): Promise<PDEDemonstration | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pde_demonstrations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`PDEDemonstrationService.getById failed: ${error.message}`);
    }
    return (data as unknown as PDEDemonstration) ?? null;
  }

  /**
   * Insert a draft demonstration. Honors `input.learner_id` if provided
   * (super_admin acting on behalf), otherwise stamps the current user.
   * `status='draft'` always — promote via `submit()`.
   */
  static async create(input: CreatePDEDemonstrationInput): Promise<PDEDemonstration> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('PDEDemonstrationService.create: not authenticated');
    }

    const learnerId = input.learner_id || user.id;

    const insertRow = {
      learner_id: learnerId,
      institution_id: input.institution_id ?? null,
      category_key: input.category_key,
      rubric_policy_key: input.rubric_policy_key ?? null,
      skill_name: input.skill_name ?? null,
      evidence: input.evidence ?? {},
      evidence_type: input.evidence_type ?? null,
      status: 'draft' as const,
      created_by: user.id,
      // Curriculum connector — dual-lane link (BoS syllabus XOR VAC course).
      // clo_refs is the learner's PROPOSAL only; the validator-confirmed set
      // (clo_refs_confirmed) is written at validation time, never here.
      bos_syllabus_id: input.bos_syllabus_id ?? null,
      vac_course_id: input.vac_course_id ?? null,
      clo_refs: input.clo_refs && input.clo_refs.length > 0 ? input.clo_refs : null,
    };

    const { data, error } = await supabase
      .from('pde_demonstrations')
      .insert(insertRow)
      .select()
      .single();

    if (error) {
      throw new Error(`PDEDemonstrationService.create failed: ${error.message}`);
    }
    return data as unknown as PDEDemonstration;
  }

  /**
   * Edit an existing DRAFT demonstration's learner-editable fields. Used by the
   * learner edit/resubmit flow (#9b): when a validator returns a submission with
   * decision='changes_requested', the row is set back to 'draft' and the learner
   * re-opens the new-demonstration form in edit mode to fix it.
   *
   * Only the fields a learner authored are editable: skill_name, evidence,
   * evidence_type, category_key, rubric_policy_key, and the dual-lane curriculum
   * link (bos_syllabus_id / vac_course_id / clo_refs). Validation fields
   * (raw_score, validator_notes, status) are never touched here.
   *
   * The `.eq('status', 'draft')` guard means an edit only lands while the row is
   * a draft (mirrors submit()/withdraw()'s status guards) — a row already past
   * draft can't be silently rewritten. RLS additionally restricts the write to
   * the owning learner (pde_demonstrations_learner_own, FOR ALL). After saving,
   * the caller promotes the row via submit() to resubmit it for review.
   */
  static async update(
    id: string,
    fields: {
      category_key?: PDECategoryKey;
      rubric_policy_key?: string | null;
      skill_name?: string | null;
      evidence?: CreatePDEDemonstrationInput['evidence'];
      evidence_type?: string | null;
      bos_syllabus_id?: string | null;
      vac_course_id?: string | null;
      clo_refs?: number[] | null;
    }
  ): Promise<PDEDemonstration> {
    const supabase = await createClient();

    // Build the patch from only the keys the caller supplied so omitted fields
    // keep their existing values.
    const patch: Record<string, unknown> = {};
    if (fields.category_key !== undefined) patch.category_key = fields.category_key;
    if (fields.rubric_policy_key !== undefined) patch.rubric_policy_key = fields.rubric_policy_key;
    if (fields.skill_name !== undefined) patch.skill_name = fields.skill_name;
    if (fields.evidence !== undefined) patch.evidence = fields.evidence ?? {};
    if (fields.evidence_type !== undefined) patch.evidence_type = fields.evidence_type;
    if (fields.bos_syllabus_id !== undefined) patch.bos_syllabus_id = fields.bos_syllabus_id;
    if (fields.vac_course_id !== undefined) patch.vac_course_id = fields.vac_course_id;
    if (fields.clo_refs !== undefined) {
      patch.clo_refs = fields.clo_refs && fields.clo_refs.length > 0 ? fields.clo_refs : null;
    }

    const { data, error } = await supabase
      .from('pde_demonstrations')
      .update(patch)
      .eq('id', id)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) {
      // If the row isn't a draft (or isn't ours), the update affects 0 rows and
      // PostgREST returns PGRST116. Surface a clear, actionable error instead of
      // a raw status code.
      const existing = await this.getById(id);
      if (existing && existing.status !== 'draft') {
        throw new Error(
          'PDEDemonstrationService.update: only a draft demonstration can be edited'
        );
      }
      throw new Error(`PDEDemonstrationService.update failed: ${error.message}`);
    }
    return data as unknown as PDEDemonstration;
  }

  /**
   * Flip draft → submitted. Stamps submitted_at = now(). No-op if already
   * past 'submitted' (returns the row unchanged).
   */
  static async submit(id: string): Promise<PDEDemonstration> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pde_demonstrations')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) {
      // If the row exists but wasn't in 'draft' status, the update returns 0
      // rows + a PGRST116. Fall back to a plain fetch so the caller still
      // gets a usable row.
      const existing = await this.getById(id);
      if (existing) return existing;
      throw new Error(`PDEDemonstrationService.submit failed: ${error.message}`);
    }
    return data as unknown as PDEDemonstration;
  }

  /**
   * Flip to 'withdrawn'. Allowed from draft + submitted only (other terminal
   * states stay put).
   */
  static async withdraw(id: string): Promise<PDEDemonstration> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pde_demonstrations')
      .update({ status: 'withdrawn' })
      .eq('id', id)
      .in('status', ['draft', 'submitted'])
      .select()
      .single();

    if (error) {
      const existing = await this.getById(id);
      if (existing) return existing;
      throw new Error(`PDEDemonstrationService.withdraw failed: ${error.message}`);
    }
    return data as unknown as PDEDemonstration;
  }

  /**
   * Enumerate rubric policy rows for a given PDE category. Reads each rubric
   * via the `fn_get_policy_json` RPC so per-institution overrides are honored
   * if/when they're added in the future. Categories without seeded rubrics
   * return [] — the form should fall back to free-form input in that case.
   */
  static async listRubricsForCategory(
    categoryKey: PDECategoryKey,
    institutionId?: string | null
  ): Promise<RubricChoice[]> {
    const keys = CATEGORY_RUBRIC_KEYS[categoryKey];
    if (!keys || keys.length === 0) return [];

    const supabase = await createServerSupabaseClient();
    const results = await Promise.all(
      keys.map(async (key) => {
        const { data, error } = await supabase.rpc('fn_get_policy_json', {
          p_key: key,
          p_default: {},
          p_scope_id: institutionId ?? null,
        });
        if (error) {
          // Fail-soft: skip the rubric but don't crash the whole form.
          // eslint-disable-next-line no-console
          console.warn(`[pde-demonstration-service] rubric fetch failed for ${key}`, error.message);
          return null;
        }
        return {
          key,
          value: (data ?? {}) as Record<string, unknown>,
        } satisfies RubricChoice;
      })
    );

    return results.filter((r): r is RubricChoice => r !== null);
  }
}
