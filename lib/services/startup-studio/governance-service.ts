// lib/services/startup-studio/governance-service.ts
// CRUD + analytics for governance members, compliance items, and readiness assessments

import { BaseService } from '../base-service';
import type {
  SSGovernanceMember,
  CreateGovernanceMemberInput,
  UpdateGovernanceMemberInput,
  SSComplianceItem,
  CreateComplianceItemInput,
  UpdateComplianceStatusInput,
  ComplianceDashboard,
  SSReadinessAssessment,
  CreateReadinessAssessmentInput,
} from '@/types/startup-studio';

export class GovernanceService extends BaseService {
  // ============================================
  // GOVERNANCE MEMBERS
  // ============================================

  /**
   * Get governance members, optionally filtered by body and/or institution
   */
  static async getGovernanceMembers(filters?: {
    body?: string;
    is_active?: boolean;
    institution_id?: string;
  }): Promise<SSGovernanceMember[]> {
    let query = this.supabase
      .from('ss_governance_members')
      .select('*')
      .order('body', { ascending: true })
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    if (filters?.body) {
      query = query.eq('body', filters.body);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch governance members: ' + error.message);
    return (data || []) as SSGovernanceMember[];
  }

  /**
   * Add a new governance member
   */
  static async addGovernanceMember(input: CreateGovernanceMemberInput): Promise<SSGovernanceMember> {
    const { data, error } = await this.supabase
      .from('ss_governance_members')
      .insert({
        name: input.name,
        designation: input.designation ?? null,
        organization: input.organization ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        body: input.body,
        role: input.role,
        term_start: input.term_start ?? null,
        term_end: input.term_end ?? null,
        is_active: input.is_active ?? true,
        coi_declaration_filed: input.coi_declaration_filed ?? false,
        coi_details: input.coi_details ?? null,
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to add governance member: ' + error.message);
    return data as SSGovernanceMember;
  }

  /**
   * Update a governance member
   */
  static async updateGovernanceMember(
    memberId: string,
    updates: UpdateGovernanceMemberInput
  ): Promise<SSGovernanceMember> {
    const { data, error } = await this.supabase
      .from('ss_governance_members')
      .update(updates)
      .eq('id', memberId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update governance member: ' + error.message);
    return data as SSGovernanceMember;
  }

  /**
   * Remove (soft-delete by deactivating) a governance member
   */
  static async removeGovernanceMember(memberId: string): Promise<SSGovernanceMember> {
    const { data, error } = await this.supabase
      .from('ss_governance_members')
      .update({ is_active: false })
      .eq('id', memberId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to remove governance member: ' + error.message);
    return data as SSGovernanceMember;
  }

  // ============================================
  // COMPLIANCE ITEMS
  // ============================================

  /**
   * Get compliance items, optionally filtered
   */
  static async getComplianceItems(filters?: {
    category?: string;
    status?: string;
    is_critical?: boolean;
    institution_id?: string;
  }): Promise<SSComplianceItem[]> {
    let query = this.supabase
      .from('ss_compliance_items')
      .select('*')
      .order('is_critical', { ascending: false })
      .order('due_date', { ascending: true })
      .order('category', { ascending: true });

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_critical !== undefined) {
      query = query.eq('is_critical', filters.is_critical);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch compliance items: ' + error.message);
    return (data || []) as SSComplianceItem[];
  }

  /**
   * Create a new compliance item
   */
  static async createComplianceItem(input: CreateComplianceItemInput): Promise<SSComplianceItem> {
    const { data, error } = await this.supabase
      .from('ss_compliance_items')
      .insert({
        category: input.category,
        requirement: input.requirement,
        description: input.description ?? null,
        frequency: input.frequency,
        due_date: input.due_date ?? null,
        is_critical: input.is_critical ?? false,
        reminder_days_before: input.reminder_days_before ?? 30,
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create compliance item: ' + error.message);
    return data as SSComplianceItem;
  }

  /**
   * Update status of a compliance item
   */
  static async updateComplianceStatus(
    itemId: string,
    updates: UpdateComplianceStatusInput
  ): Promise<SSComplianceItem> {
    const { data, error } = await this.supabase
      .from('ss_compliance_items')
      .update({
        status: updates.status,
        completed_date: updates.completed_date ?? null,
        completed_by: updates.completed_by ?? null,
        evidence_url: updates.evidence_url ?? null,
        notes: updates.notes ?? null,
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update compliance status: ' + error.message);
    return data as SSComplianceItem;
  }

  /**
   * Get compliance dashboard: summary counts and rates
   */
  static async getComplianceDashboard(institutionId?: string): Promise<ComplianceDashboard> {
    let query = this.supabase
      .from('ss_compliance_items')
      .select('status, is_critical');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch compliance dashboard: ' + error.message);

    const items = data || [];
    const total = items.length;
    const completed = items.filter((i: any) => i.status === 'completed').length;
    const overdue = items.filter((i: any) => i.status === 'overdue').length;
    const inProgress = items.filter((i: any) => i.status === 'in_progress').length;
    const criticalOverdue = items.filter(
      (i: any) => i.status === 'overdue' && i.is_critical
    ).length;

    return {
      total,
      completed,
      overdue,
      in_progress: inProgress,
      completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      critical_overdue: criticalOverdue,
    };
  }

  // ============================================
  // READINESS ASSESSMENTS
  // ============================================

  /**
   * Get readiness assessments, most recent first
   */
  static async getReadinessAssessments(institutionId?: string): Promise<SSReadinessAssessment[]> {
    let query = this.supabase
      .from('ss_readiness_assessments')
      .select('*')
      .order('assessment_date', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch readiness assessments: ' + error.message);
    return (data || []) as SSReadinessAssessment[];
  }

  /**
   * Create a new readiness assessment, computing pillar scores and weakest pillar
   */
  static async createReadinessAssessment(
    input: CreateReadinessAssessmentInput
  ): Promise<SSReadinessAssessment> {
    // Compute pillar scores from sub-scores
    const infraScore =
      (input.infra_physical_facilities ?? 0) +
      (input.infra_it_systems ?? 0) +
      (input.infra_lab_equipment ?? 0) +
      (input.infra_connectivity ?? 0) +
      (input.infra_co_working_space ?? 0);

    const financeScore =
      (input.finance_budget_process ?? 0) +
      (input.finance_audit_compliance ?? 0) +
      (input.finance_grant_management ?? 0) +
      (input.finance_sustainability_plan ?? 0);

    const boardScore =
      (input.board_governance_structure ?? 0) +
      (input.board_meeting_regularity ?? 0) +
      (input.board_committee_formation ?? 0) +
      (input.board_strategic_planning ?? 0);

    const hrScore =
      (input.hr_staff_capacity ?? 0) +
      (input.hr_training_programs ?? 0) +
      (input.hr_mentor_network ?? 0) +
      (input.hr_policies_in_place ?? 0);

    const legalScore =
      (input.legal_registration_complete ?? 0) +
      (input.legal_ip_policy ?? 0) +
      (input.legal_incubation_policy ?? 0) +
      (input.legal_sop_documentation ?? 0);

    // Determine weakest pillar
    const pillars = [
      { name: 'infrastructure', score: infraScore },
      { name: 'finance', score: financeScore },
      { name: 'board', score: boardScore },
      { name: 'hr', score: hrScore },
      { name: 'legal', score: legalScore },
    ];
    pillars.sort((a, b) => a.score - b.score);
    const weakestPillar = pillars[0].name;

    const { data, error } = await this.supabase
      .from('ss_readiness_assessments')
      .insert({
        assessment_date: input.assessment_date ?? new Date().toISOString().split('T')[0],
        assessed_by: input.assessed_by ?? null,
        // Infrastructure
        infra_score: infraScore,
        infra_physical_facilities: input.infra_physical_facilities ?? 0,
        infra_it_systems: input.infra_it_systems ?? 0,
        infra_lab_equipment: input.infra_lab_equipment ?? 0,
        infra_connectivity: input.infra_connectivity ?? 0,
        infra_co_working_space: input.infra_co_working_space ?? 0,
        // Finance
        finance_score: financeScore,
        finance_budget_process: input.finance_budget_process ?? 0,
        finance_audit_compliance: input.finance_audit_compliance ?? 0,
        finance_grant_management: input.finance_grant_management ?? 0,
        finance_sustainability_plan: input.finance_sustainability_plan ?? 0,
        // Board
        board_score: boardScore,
        board_governance_structure: input.board_governance_structure ?? 0,
        board_meeting_regularity: input.board_meeting_regularity ?? 0,
        board_committee_formation: input.board_committee_formation ?? 0,
        board_strategic_planning: input.board_strategic_planning ?? 0,
        // HR
        hr_score: hrScore,
        hr_staff_capacity: input.hr_staff_capacity ?? 0,
        hr_training_programs: input.hr_training_programs ?? 0,
        hr_mentor_network: input.hr_mentor_network ?? 0,
        hr_policies_in_place: input.hr_policies_in_place ?? 0,
        // Legal
        legal_score: legalScore,
        legal_registration_complete: input.legal_registration_complete ?? 0,
        legal_ip_policy: input.legal_ip_policy ?? 0,
        legal_incubation_policy: input.legal_incubation_policy ?? 0,
        legal_sop_documentation: input.legal_sop_documentation ?? 0,
        // Summary
        weakest_pillar: weakestPillar,
        improvement_plan: input.improvement_plan ?? null,
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create readiness assessment: ' + error.message);
    return data as SSReadinessAssessment;
  }

  /**
   * Get the latest readiness assessment for an institution
   */
  static async getLatestReadiness(institutionId?: string): Promise<SSReadinessAssessment | null> {
    let query = this.supabase
      .from('ss_readiness_assessments')
      .select('*')
      .order('assessment_date', { ascending: false })
      .limit(1);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error('Failed to fetch latest readiness: ' + error.message);
    return data as SSReadinessAssessment | null;
  }
}

export const governanceService = {
  getGovernanceMembers: GovernanceService.getGovernanceMembers.bind(GovernanceService),
  addGovernanceMember: GovernanceService.addGovernanceMember.bind(GovernanceService),
  updateGovernanceMember: GovernanceService.updateGovernanceMember.bind(GovernanceService),
  removeGovernanceMember: GovernanceService.removeGovernanceMember.bind(GovernanceService),
  getComplianceItems: GovernanceService.getComplianceItems.bind(GovernanceService),
  createComplianceItem: GovernanceService.createComplianceItem.bind(GovernanceService),
  updateComplianceStatus: GovernanceService.updateComplianceStatus.bind(GovernanceService),
  getComplianceDashboard: GovernanceService.getComplianceDashboard.bind(GovernanceService),
  getReadinessAssessments: GovernanceService.getReadinessAssessments.bind(GovernanceService),
  createReadinessAssessment: GovernanceService.createReadinessAssessment.bind(GovernanceService),
  getLatestReadiness: GovernanceService.getLatestReadiness.bind(GovernanceService),
};
