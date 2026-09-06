/**
 * Risk & Issue (RAID) Service
 *
 * CRUD + escalation + mitigation steps for the RAID register:
 *   project_risks, project_issues, project_risk_mitigation_steps,
 *   project_risk_escalations.
 *
 * "Create task from mitigation step" delegates to TaskService so the linked
 * project task is created with the same INSERT shape used everywhere else, then
 * back-links the new task id onto the step.
 *
 * Pattern: static class, SupabaseClient as first arg (matches ProjectService /
 * TaskService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TaskService } from '@/lib/services/projects/task-service';
import type {
  ProjectRisk,
  ProjectIssue,
  ProjectRiskMitigationStep,
  ProjectRiskEscalation,
  ProjectTask,
} from '@/types/projects';
import type {
  ProjectRiskInsert,
  ProjectRiskUpdate,
  RiskFilters,
  ProjectIssueInsert,
  ProjectIssueUpdate,
  IssueFilters,
  MitigationStepInsert,
  MitigationStepUpdate,
  EscalationInsert,
} from '@/types/projects-risks';

export class RiskService {
  // ─── Risks ────────────────────────────────────────────────────────────────────

  static async listRisks(
    supabase: SupabaseClient,
    filters: RiskFilters = {}
  ): Promise<ProjectRisk[]> {
    let query = supabase
      .from('project_risks')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.taskId) {
      query = query.eq('task_id', filters.taskId);
    }
    if (filters.milestoneId) {
      query = query.eq('milestone_id', filters.milestoneId);
    }
    if (filters.statusKey) {
      query = query.eq('status_key', filters.statusKey);
    }
    if (filters.ragStatus) {
      query = query.eq('rag_status', filters.ragStatus);
    }
    if (filters.riskCategory) {
      query = query.eq('risk_category', filters.riskCategory);
    }
    if (filters.ownerStaffId) {
      query = query.eq('owner_staff_id', filters.ownerStaffId);
    }
    if (filters.isEscalated !== undefined && filters.isEscalated !== null) {
      query = query.eq('is_escalated', filters.isEscalated);
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectRisk[];
  }

  static async getRisk(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectRisk | null> {
    const { data, error } = await supabase
      .from('project_risks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectRisk | null;
  }

  static async createRisk(
    supabase: SupabaseClient,
    input: ProjectRiskInsert
  ): Promise<ProjectRisk> {
    const { data, error } = await supabase
      .from('project_risks')
      .insert(input)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectRisk;
  }

  static async updateRisk(
    supabase: SupabaseClient,
    id: string,
    input: ProjectRiskUpdate
  ): Promise<ProjectRisk> {
    const { data, error } = await supabase
      .from('project_risks')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectRisk;
  }

  static async deleteRisk(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase.from('project_risks').delete().eq('id', id);
    if (error) throw error;
  }

  // ─── Escalation ─────────────────────────────────────────────────────────────────
  //
  // Manual escalation only. AUTO-escalation (forgotten-risk safety net, success
  // criterion F3.8) is a CRON concern and lives OUTSIDE this UI service — it should
  // read the policy keys `pm.escalation_overdue_days` / `pm.escalation_red_age_days`
  // / `pm.escalation_target_role` from platform_policies and call escalateRisk with
  // is_auto = true. TODO(pm-escalation-cron): implement the scheduled job.

  /**
   * Flag a risk as escalated and append an escalation-history row.
   * Sets project_risks.is_escalated + escalated_at; writes a
   * project_risk_escalations record. is_auto stays false (manual UI path).
   */
  static async escalateRisk(
    supabase: SupabaseClient,
    input: EscalationInsert
  ): Promise<{ risk: ProjectRisk; escalation: ProjectRiskEscalation }> {
    const now = new Date().toISOString();

    const { data: escalation, error: escError } = await supabase
      .from('project_risk_escalations')
      .insert({
        risk_id: input.risk_id,
        escalated_to_staff_id: input.escalated_to_staff_id ?? null,
        escalated_by: input.escalated_by ?? null,
        escalation_level: input.escalation_level ?? null,
        reason: input.reason ?? null,
        is_auto: input.is_auto ?? false,
      })
      .select('*')
      .single();

    if (escError) throw escError;

    const { data: risk, error: riskError } = await supabase
      .from('project_risks')
      .update({ is_escalated: true, escalated_at: now })
      .eq('id', input.risk_id)
      .select('*')
      .single();

    if (riskError) throw riskError;

    return {
      risk: risk as ProjectRisk,
      escalation: escalation as ProjectRiskEscalation,
    };
  }

  static async listEscalations(
    supabase: SupabaseClient,
    riskId: string
  ): Promise<ProjectRiskEscalation[]> {
    const { data, error } = await supabase
      .from('project_risk_escalations')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ProjectRiskEscalation[];
  }

  // ─── Mitigation steps ───────────────────────────────────────────────────────────

  static async listMitigationSteps(
    supabase: SupabaseClient,
    riskId: string
  ): Promise<ProjectRiskMitigationStep[]> {
    const { data, error } = await supabase
      .from('project_risk_mitigation_steps')
      .select('*')
      .eq('risk_id', riskId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ProjectRiskMitigationStep[];
  }

  static async addMitigationStep(
    supabase: SupabaseClient,
    input: MitigationStepInsert
  ): Promise<ProjectRiskMitigationStep> {
    const { data, error } = await supabase
      .from('project_risk_mitigation_steps')
      .insert({
        risk_id: input.risk_id,
        description: input.description,
        owner_staff_id: input.owner_staff_id ?? null,
        deadline: input.deadline ?? null,
        order_index: input.order_index ?? 0,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectRiskMitigationStep;
  }

  static async updateMitigationStep(
    supabase: SupabaseClient,
    id: string,
    input: MitigationStepUpdate
  ): Promise<ProjectRiskMitigationStep> {
    const { data, error } = await supabase
      .from('project_risk_mitigation_steps')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectRiskMitigationStep;
  }

  static async deleteMitigationStep(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('project_risk_mitigation_steps')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Create a linked project task FROM a mitigation step, then back-link the new
   * task id onto the step. Returns both the created task and the updated step.
   *
   * The task carries the step's description (title), owner, and deadline; it is
   * filed under the risk's project. If the step already links a task, the existing
   * link is returned without creating a duplicate.
   */
  static async createTaskFromStep(
    supabase: SupabaseClient,
    step: ProjectRiskMitigationStep,
    projectId: string
  ): Promise<{ task: ProjectTask; step: ProjectRiskMitigationStep }> {
    if (step.linked_task_id) {
      const existing = await TaskService.getTask(supabase, step.linked_task_id);
      if (existing) {
        return { task: existing, step };
      }
      // Linked task was deleted — fall through and create a fresh one.
    }

    const task = await TaskService.createTask(supabase, {
      project_id: projectId,
      title: step.description.slice(0, 200),
      description: `Mitigation step for risk. ${step.description}`,
      owner_staff_id: step.owner_staff_id ?? null,
      due_date: step.deadline ?? null,
    });

    const updatedStep = await RiskService.updateMitigationStep(supabase, step.id, {
      linked_task_id: task.id,
    });

    return { task, step: updatedStep };
  }
}

export class IssueService {
  static async listIssues(
    supabase: SupabaseClient,
    filters: IssueFilters = {}
  ): Promise<ProjectIssue[]> {
    let query = supabase
      .from('project_issues')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.taskId) {
      query = query.eq('task_id', filters.taskId);
    }
    if (filters.raisedFromRiskId) {
      query = query.eq('raised_from_risk_id', filters.raisedFromRiskId);
    }
    if (filters.statusKey) {
      query = query.eq('status_key', filters.statusKey);
    }
    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters.ownerStaffId) {
      query = query.eq('owner_staff_id', filters.ownerStaffId);
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectIssue[];
  }

  static async getIssue(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectIssue | null> {
    const { data, error } = await supabase
      .from('project_issues')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectIssue | null;
  }

  static async createIssue(
    supabase: SupabaseClient,
    input: ProjectIssueInsert
  ): Promise<ProjectIssue> {
    const { data, error } = await supabase
      .from('project_issues')
      .insert(input)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectIssue;
  }

  static async updateIssue(
    supabase: SupabaseClient,
    id: string,
    input: ProjectIssueUpdate
  ): Promise<ProjectIssue> {
    const { data, error } = await supabase
      .from('project_issues')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectIssue;
  }

  /** Mark an issue resolved: stamps resolved_at + status, records notes. */
  static async resolveIssue(
    supabase: SupabaseClient,
    id: string,
    resolutionNotes: string | null = null,
    statusKey = 'resolved'
  ): Promise<ProjectIssue> {
    const { data, error } = await supabase
      .from('project_issues')
      .update({
        status_key: statusKey,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectIssue;
  }

  static async deleteIssue(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase.from('project_issues').delete().eq('id', id);
    if (error) throw error;
  }
}
