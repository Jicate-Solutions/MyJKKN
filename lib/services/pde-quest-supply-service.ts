/**
 * PDE Quest Supply Service (Tier 3 — T3.1)
 * ============================================================================
 *
 * Submission pipeline for quests proposed by external / non-staff sources
 * (industry partners, alumni, current students). Approved proposals become
 * `pde_quests` rows with `status='active'`.
 *
 * Policy consumed:
 *   `pde.quests.supply_sources` via `getQuestsSupplySources()`
 *   (default = ['internal_departments','industry_partners','alumni_led',
 *    'student_proposed'] — seeded by Cluster D migration).
 *
 * Backing table: `public.pde_quests` (no schema migration in T3.1; reuses
 *   columns `status`, `source_type`, `source_contact`, `created_by`).
 *   - `status='proposed'` means awaiting admin review
 *   - `status='active'`   means approved & open for learners (canonical UI lists)
 *
 * Flow
 * ----
 * 1. `submitQuestProposal(input)` — validates `source_type` against active
 *    policy, INSERTs a row with `status='proposed'`. Caller must be authed.
 *
 * 2. `listProposedQuests(institutionId?)` — SELECT rows with
 *    `status='proposed'`, newest first. Admin-only via RLS at the API layer.
 *
 * 3. `approveQuestProposal(questId, approverId)` — UPDATE `status` from
 *    'proposed' to 'active'. Returns the new row.
 *
 * Pattern alignment: thin class with static methods, mirrors
 * `lib/services/pde-pace-cap-service.ts` (Tier 2 sibling).
 *
 * Phase: PDE Tier 3.1 — 2026-05-19.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getQuestsSupplySources } from '@/lib/services/pde-policy-reader';
import type { QuestSupplySource } from '@/lib/services/pde-policy-reader-types';

export interface QuestProposalInput {
  title: string;
  description: string;
  problem_statement: string;
  quest_type: string;
  deliverable_description: string;
  source_type: QuestSupplySource;
  source_contact?: string | null;
  source_department?: string | null;
  difficulty?: string | null;
  estimated_hours?: number | null;
}

export interface ProposedQuestRow {
  id: string;
  title: string;
  description: string;
  status: string;
  source_type: string | null;
  source_contact: string | null;
  source_department: string | null;
  created_by: string | null;
  created_at: string;
}

export class InvalidSupplySourceError extends Error {
  constructor(source: string, allowed: QuestSupplySource[]) {
    super(
      `Source '${source}' is not in the currently allowed quest supply sources ` +
      `[${allowed.join(', ')}]. Update pde.quests.supply_sources to enable it.`
    );
    this.name = 'InvalidSupplySourceError';
  }
}

export class PDEQuestSupplyService {
  /**
   * Submits a new quest proposal. Validates `source_type` against the active
   * `pde.quests.supply_sources` policy. INSERTs with `status='proposed'`.
   */
  static async submitQuestProposal(
    input: QuestProposalInput,
    institutionId?: string | null
  ): Promise<{ id: string }> {
    const allowed = await getQuestsSupplySources(institutionId);
    if (!allowed.includes(input.source_type)) {
      throw new InvalidSupplySourceError(input.source_type, allowed);
    }

    const supabase = await createServerSupabaseClient();
    const { data: authUser } = await supabase.auth.getUser();
    if (!authUser?.user?.id) {
      throw new Error('PDEQuestSupplyService.submitQuestProposal: unauthenticated');
    }

    const { data, error } = await (supabase as any)
      .from('pde_quests')
      .insert({
        title: input.title,
        description: input.description,
        problem_statement: input.problem_statement,
        quest_type: input.quest_type,
        deliverable_description: input.deliverable_description,
        source_type: input.source_type,
        source_contact: input.source_contact ?? null,
        source_department: input.source_department ?? null,
        difficulty: input.difficulty ?? null,
        estimated_hours: input.estimated_hours ?? null,
        status: 'proposed',
        created_by: authUser.user.id,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`PDEQuestSupplyService.submitQuestProposal INSERT failed: ${error.message}`);
    }
    return { id: data.id };
  }

  /**
   * Lists pending proposals (status='proposed'), newest first. RLS at the
   * table level is the hard gate; this method is the admin convenience read.
   */
  static async listProposedQuests(
    limit = 100
  ): Promise<ProposedQuestRow[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('pde_quests')
      .select('id, title, description, status, source_type, source_contact, source_department, created_by, created_at')
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`PDEQuestSupplyService.listProposedQuests failed: ${error.message}`);
    }
    return (data ?? []) as ProposedQuestRow[];
  }

  /**
   * Approves a proposed quest by flipping `status` from 'proposed' to
   * 'active'. Returns the updated row. RLS restricts UPDATE to admin roles.
   */
  static async approveQuestProposal(
    questId: string,
    _approverId: string
  ): Promise<ProposedQuestRow> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('pde_quests')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', questId)
      .eq('status', 'proposed')
      .select('id, title, description, status, source_type, source_contact, source_department, created_by, created_at')
      .single();

    if (error) {
      throw new Error(`PDEQuestSupplyService.approveQuestProposal failed: ${error.message}`);
    }
    if (!data) {
      throw new Error(`PDEQuestSupplyService.approveQuestProposal: quest ${questId} not found or not in 'proposed' state`);
    }
    return data as ProposedQuestRow;
  }
}
