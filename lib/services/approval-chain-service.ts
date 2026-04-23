import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ApprovalChainRule,
  ApprovalChainRuleSummary,
  ApprovalChainRun,
  ApprovalChainCriteria,
  ApprovalChainWorkflowType,
  StartRunDTO,
  AdvanceRunDTO,
  UpdateApprovalChainRuleDTO,
  RunHistoryEntry,
  StageDefinition,
} from '@/types/approval-chain';

/**
 * Engine service — workflow-agnostic approval chain runtime.
 *
 * Consumed by: hostel_vacate workflow (first), followed by hostel_leave,
 * gate_passes, etc. as those flows migrate onto the engine.
 *
 * Responsibility boundary: engine manages stage progression + history.
 * It does NOT mutate the subject table (e.g. hostel_vacate_requests) — the
 * workflow's own service does that based on engine's current_stage_idx.
 */
export class ApprovalChainService {
  // ── List rules for settings UI ────────────────────────────────────
  static async getRules(institutionId: string, workflowType?: ApprovalChainWorkflowType) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('approval_chain_rules')
        .select('*', { count: 'exact' });

      // Guard: empty/undefined institutionId means super_admin view (no filter).
      // Without this guard, Postgres rejects .eq('institution_id', '') with
      // "invalid input syntax for type uuid". Caught on prod 2026-04-23.
      if (institutionId) query = query.eq('institution_id', institutionId);

      if (workflowType) query = query.eq('workflow_type', workflowType);
      query = query
        .order('workflow_type', { ascending: true })
        .order('priority', { ascending: true });

      const { data, error, count } = await query;
      if (error) {
        logger.error('approval-chain/rules', 'Failed to fetch rules', error);
        throw error;
      }
      const rules = (data ?? []) as ApprovalChainRule[];
      const summaries: ApprovalChainRuleSummary[] = rules.map((r) => ({
        ...r,
        stage_count: r.stages.length,
        criteria_summary: summarizeCriteria(r.criteria),
      }));
      return { data: summaries, count: count ?? 0 };
    } catch (error) {
      logger.error('approval-chain/rules', 'Unexpected error in getRules', error);
      throw error;
    }
  }

  // ── Single rule ────────────────────────────────────────────────────
  static async getRule(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('approval_chain_rules')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('approval-chain/rules', 'Failed to fetch rule', error);
        throw error;
      }
      return data as ApprovalChainRule;
    } catch (error) {
      logger.error('approval-chain/rules', 'Unexpected error in getRule', error);
      throw error;
    }
  }

  // ── Update rule metadata (name / description / active / priority only in PR-0) ──
  static async updateRule(id: string, payload: UpdateApprovalChainRuleDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('approval_chain_rules')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('approval-chain/rules', 'Failed to update rule', error);
        throw error;
      }
      return data as ApprovalChainRule;
    } catch (error) {
      logger.error('approval-chain/rules', 'Unexpected error in updateRule', error);
      throw error;
    }
  }

  // ── Delete rule (blocked by FK RESTRICT if runs reference it) ─────
  static async deleteRule(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase.from('approval_chain_rules').delete().eq('id', id);
      if (error) {
        logger.error('approval-chain/rules', 'Failed to delete rule', error);
        throw error;
      }
    } catch (error) {
      logger.error('approval-chain/rules', 'Unexpected error in deleteRule', error);
      throw error;
    }
  }

  // ── Bulk delete with per-ID isolation ─────────────────────────────
  static async bulkDeleteRules(ids: string[]) {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteRule(id);
        success.push(id);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { success, failed };
  }

  // ── Select matching rule for a new workflow run ───────────────────
  // Applies criteria matcher; lowest priority wins when multiple match.
  static async selectRule(
    institutionId: string,
    workflowType: ApprovalChainWorkflowType,
    context: Record<string, unknown>
  ): Promise<ApprovalChainRule | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('approval_chain_rules')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('workflow_type', workflowType)
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (error) {
        logger.error('approval-chain/engine', 'Failed to query rules for selection', error);
        throw error;
      }

      const candidates = (data ?? []) as ApprovalChainRule[];
      const match = candidates.find((r) => criteriaMatches(r.criteria, context));
      return match ?? null;
    } catch (error) {
      logger.error('approval-chain/engine', 'Unexpected error in selectRule', error);
      throw error;
    }
  }

  // ── Start a new run ───────────────────────────────────────────────
  static async startRun(payload: StartRunDTO): Promise<ApprovalChainRun> {
    try {
      const rule = await this.selectRule(
        payload.institution_id,
        payload.workflow_type,
        payload.context
      );
      if (!rule) {
        throw new Error(
          `No matching approval_chain_rule found for workflow_type=${payload.workflow_type} with context ${JSON.stringify(payload.context)}`
        );
      }

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('approval_chain_runs')
        .insert({
          institution_id: payload.institution_id,
          rule_id: rule.id,
          subject_type: payload.workflow_type,
          subject_id: payload.subject_id,
          current_stage_idx: 0,
          status: 'in_progress',
          history: [],
          context: payload.context,
        })
        .select()
        .single();

      if (error) {
        logger.error('approval-chain/engine', 'Failed to start run', error);
        throw error;
      }
      return data as ApprovalChainRun;
    } catch (error) {
      logger.error('approval-chain/engine', 'Unexpected error in startRun', error);
      throw error;
    }
  }

  // ── Advance a run to the next stage (or complete/reject) ──────────
  static async advance(payload: AdvanceRunDTO): Promise<ApprovalChainRun> {
    try {
      const supabase = createClientSupabaseClient();
      const { data: runRow, error: runErr } = await supabase
        .from('approval_chain_runs')
        .select('*, rule:approval_chain_rules(*)')
        .eq('id', payload.run_id)
        .single();

      if (runErr) {
        logger.error('approval-chain/engine', 'Failed to fetch run for advance', runErr);
        throw runErr;
      }
      const run = runRow as ApprovalChainRun & { rule: ApprovalChainRule };

      if (run.status !== 'in_progress') {
        throw new Error(`Run ${run.id} is not in_progress (status=${run.status}); cannot advance.`);
      }

      const stages = run.rule.stages as StageDefinition[];
      const currentStage = stages[run.current_stage_idx];
      if (!currentStage) {
        throw new Error(`Run ${run.id} has invalid current_stage_idx=${run.current_stage_idx}`);
      }

      const newHistoryEntry: RunHistoryEntry = {
        stage_idx: run.current_stage_idx,
        stage_name: currentStage.stage_name,
        actor_id: payload.actor_id,
        action: payload.action,
        remarks: payload.remarks ?? null,
        at: new Date().toISOString(),
      };
      const newHistory = [...run.history, newHistoryEntry];

      let newStageIdx = run.current_stage_idx;
      let newStatus = run.status;
      let completedAt: string | null = null;

      if (payload.action === 'approve' || payload.action === 'skip') {
        const nextIdx = run.current_stage_idx + 1;
        if (nextIdx >= stages.length) {
          newStatus = 'completed';
          completedAt = new Date().toISOString();
        } else {
          newStageIdx = nextIdx;
        }
      } else if (payload.action === 'reject') {
        newStatus = 'rejected';
        completedAt = new Date().toISOString();
      } else if (payload.action === 'rollback') {
        newStageIdx = Math.max(0, run.current_stage_idx - 1);
      } else if (payload.action === 'escalate') {
        const escalateTo = currentStage.sla_escalate_to_stage;
        if (escalateTo === undefined) {
          throw new Error(
            `Stage ${currentStage.stage_name} has no sla_escalate_to_stage defined; cannot escalate.`
          );
        }
        newStageIdx = escalateTo;
      }

      const { data, error } = await supabase
        .from('approval_chain_runs')
        .update({
          current_stage_idx: newStageIdx,
          status: newStatus,
          completed_at: completedAt ?? run.completed_at,
          history: newHistory,
        })
        .eq('id', run.id)
        .select()
        .single();

      if (error) {
        logger.error('approval-chain/engine', 'Failed to advance run', error);
        throw error;
      }
      return data as ApprovalChainRun;
    } catch (error) {
      logger.error('approval-chain/engine', 'Unexpected error in advance', error);
      throw error;
    }
  }

  // ── Cancel a run (subject-initiated) ──────────────────────────────
  static async cancel(runId: string, actorId: string | null, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data: runRow, error: runErr } = await supabase
        .from('approval_chain_runs')
        .select('history, status, current_stage_idx')
        .eq('id', runId)
        .single();
      if (runErr) throw runErr;
      const run = runRow as Pick<ApprovalChainRun, 'history' | 'status' | 'current_stage_idx'>;

      if (run.status !== 'in_progress') {
        throw new Error(`Run ${runId} is not in_progress (status=${run.status}); cannot cancel.`);
      }

      const historyEntry: RunHistoryEntry = {
        stage_idx: run.current_stage_idx,
        stage_name: '(cancel)',
        actor_id: actorId,
        action: 'reject',
        remarks: reason,
        at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('approval_chain_runs')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          history: [...run.history, historyEntry],
        })
        .eq('id', runId)
        .select()
        .single();

      if (error) {
        logger.error('approval-chain/engine', 'Failed to cancel run', error);
        throw error;
      }
      return data as ApprovalChainRun;
    } catch (error) {
      logger.error('approval-chain/engine', 'Unexpected error in cancel', error);
      throw error;
    }
  }

  // ── Read a run by subject (workflow service lookup) ───────────────
  static async getRunBySubject(
    subjectType: ApprovalChainWorkflowType,
    subjectId: string
  ): Promise<ApprovalChainRun | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('approval_chain_runs')
        .select('*')
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId)
        .maybeSingle();

      if (error) {
        logger.error('approval-chain/engine', 'Failed to fetch run by subject', error);
        throw error;
      }
      return data as ApprovalChainRun | null;
    } catch (error) {
      logger.error('approval-chain/engine', 'Unexpected error in getRunBySubject', error);
      throw error;
    }
  }

  // ── Get current stage of a run (derived convenience) ──────────────
  static async getCurrentStage(runId: string): Promise<StageDefinition | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('approval_chain_runs')
        .select('current_stage_idx, rule:approval_chain_rules(stages)')
        .eq('id', runId)
        .single();
      if (error) {
        logger.error('approval-chain/engine', 'Failed to fetch current stage', error);
        throw error;
      }
      const row = data as { current_stage_idx: number; rule: { stages: StageDefinition[] } };
      return row.rule.stages[row.current_stage_idx] ?? null;
    } catch (error) {
      logger.error('approval-chain/engine', 'Unexpected error in getCurrentStage', error);
      throw error;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Internal: criteria matcher
// ────────────────────────────────────────────────────────────────────

export function criteriaMatches(
  criteria: ApprovalChainCriteria,
  context: Record<string, unknown>
): boolean {
  for (const [key, expected] of Object.entries(criteria)) {
    const actual = context[key];
    if (typeof expected === 'object' && expected !== null && 'in' in expected) {
      if (!Array.isArray(expected.in) || !expected.in.includes(actual as never)) {
        return false;
      }
    } else if (expected !== actual) {
      return false;
    }
  }
  return true;
}

function summarizeCriteria(criteria: ApprovalChainCriteria): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(criteria)) {
    if (typeof v === 'object' && v !== null && 'in' in v) {
      parts.push(`${k} ∈ {${(v.in as unknown[]).join(', ')}}`);
    } else {
      parts.push(`${k} = ${String(v)}`);
    }
  }
  return parts.length === 0 ? '(matches all)' : parts.join(', ');
}
