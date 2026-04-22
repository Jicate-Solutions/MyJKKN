// Audit Finding Service — thin wrapper over service_requests
// A finding IS a service_request with service_type.slug = 'audit_finding'
// Inherits approval chains, SLA, timeline, analytics from existing engine (decision #1)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AuditFindingFormData,
  AuditFindingView,
  FindingSeverity,
  LogAuditFindingDto,
} from '@/lib/types/audit';

export class AuditFindingService {
  private static supabase = createClientSupabaseClient();
  private static readonly SERVICE_TYPE_SLUG = 'audit_finding';

  /**
   * Cache for the audit_finding service_type_id — fetched once per session.
   */
  private static async getAuditFindingServiceTypeId(): Promise<string> {
    const { data, error } = await (this.supabase as any)
      .from('service_types')
      .select('id')
      .eq('slug', this.SERVICE_TYPE_SLUG)
      .single();
    if (error) throw new Error(`audit_finding service_type not found — run seeds migration`);
    return data.id as string;
  }

  /**
   * Severity → priority mapping (service_requests.priority is a DB enum)
   */
  private static severityToPriority(sev: FindingSeverity): 'urgent' | 'high' | 'medium' | 'low' {
    switch (sev) {
      case 'red':
        return 'high';
      case 'yellow':
        return 'medium';
      case 'green':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Resolve default owner for a finding from audit_parameter_catalog.default_owner_role
   * (institution-specific override wins over system default).
   */
  private static async resolveDefaultOwner(
    parameterCode: string,
    institutionId: string
  ): Promise<{ ownerRole: string; escalationRole: string | null; p1Sla: number; p2Sla: number }> {
    const { data, error } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .select('default_owner_role, escalation_role, p1_sla_days, p2_sla_days')
      .eq('code', parameterCode)
      .or(`institution_id.eq.${institutionId},institution_id.is.null`)
      .order('institution_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Parameter ${parameterCode} not found`);
    return {
      ownerRole: data.default_owner_role,
      escalationRole: data.escalation_role,
      p1Sla: data.p1_sla_days,
      p2Sla: data.p2_sla_days,
    };
  }

  /**
   * Log a new audit finding. Creates service_requests row with type=audit_finding.
   * Auto-resolves default owner from parameter catalog; can be overridden via assigned_to.
   */
  static async log(
    input: LogAuditFindingDto,
    opts: { requesterId: string }
  ): Promise<AuditFindingView> {
    const serviceTypeId = await this.getAuditFindingServiceTypeId();
    const owner = await this.resolveDefaultOwner(input.parameter_code, input.institution_id);

    // Resolve framework_mapping + evidence_required for the finding's form_data
    const { data: param } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .select('framework_mapping, evidence_required')
      .eq('code', input.parameter_code)
      .or(`institution_id.eq.${input.institution_id},institution_id.is.null`)
      .order('institution_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const formData: AuditFindingFormData = {
      audit_cycle_id: input.audit_cycle_id,
      parameter_code: input.parameter_code,
      severity: input.severity,
      framework_mapping: param?.framework_mapping ?? {},
      evidence_required: param?.evidence_required ?? [],
      evidence_uploaded: [],
      notes: input.notes ?? null,
      resolution: null,
    };

    const priority = input.priority ?? this.severityToPriority(input.severity);

    const { data, error } = await (this.supabase as any)
      .from('service_requests')
      .insert({
        service_type_id: serviceTypeId,
        requester_id: opts.requesterId,
        institution_id: input.institution_id,
        form_data: formData,
        priority,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        requester_context: {
          audit_finding: true,
          default_owner_role: owner.ownerRole,
          escalation_role: owner.escalationRole,
          p1_sla_days: owner.p1Sla,
          p2_sla_days: owner.p2Sla,
          expected_resolution_days: input.severity === 'red' ? owner.p1Sla : owner.p2Sla,
        },
      })
      .select('*')
      .single();
    if (error) throw error;

    return this.toView(data);
  }

  /**
   * List findings scoped to a cycle. Filters by severity / status optional.
   */
  static async listByCycle(
    cycleId: string,
    filters: { severity?: FindingSeverity; status?: string } = {}
  ): Promise<AuditFindingView[]> {
    const serviceTypeId = await this.getAuditFindingServiceTypeId();
    let query = (this.supabase as any)
      .from('service_requests')
      .select('*')
      .eq('service_type_id', serviceTypeId)
      .eq('form_data->>audit_cycle_id', cycleId)
      .order('created_at', { ascending: false });

    if (filters.severity) {
      query = query.eq('form_data->>severity', filters.severity);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: unknown) => this.toView(row as Record<string, unknown>));
  }

  /**
   * Findings assigned to the current user (for /audit/my-findings)
   */
  static async listMyFindings(userId: string): Promise<AuditFindingView[]> {
    const serviceTypeId = await this.getAuditFindingServiceTypeId();
    const { data, error } = await (this.supabase as any)
      .from('service_requests')
      .select('*')
      .eq('service_type_id', serviceTypeId)
      .or(`requester_id.eq.${userId}`)
      .in('status', ['submitted', 'in_review', 'returned'])
      .order('submitted_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: unknown) => this.toView(row as Record<string, unknown>));
  }

  /**
   * Close a finding with rectification. Fan-out trigger fires server-side to emit evidence.
   * Validates all required evidence uploaded per thrash T17.
   */
  static async closeAsRectified(
    findingId: string,
    opts: { evidenceUploaded: NonNullable<AuditFindingFormData['evidence_uploaded']>; notes?: string; userId: string }
  ): Promise<AuditFindingView> {
    const { data: finding, error: fErr } = await (this.supabase as any)
      .from('service_requests')
      .select('*')
      .eq('id', findingId)
      .single();
    if (fErr || !finding) throw fErr ?? new Error(`Finding ${findingId} not found`);

    const formData = finding.form_data as AuditFindingFormData;
    const requiredLabels = (formData.evidence_required ?? [])
      .filter(e => e.required)
      .map(e => e.label);
    const uploadedLabels = new Set(opts.evidenceUploaded.map(e => e.label));
    const missing = requiredLabels.filter(l => !uploadedLabels.has(l));
    if (missing.length > 0) {
      throw new Error(`Cannot close — missing required evidence: ${missing.join(', ')}`);
    }

    const nextFormData: AuditFindingFormData = {
      ...formData,
      evidence_uploaded: opts.evidenceUploaded,
      resolution: 'rectified',
      notes: opts.notes ?? formData.notes ?? null,
    };

    const { data, error } = await (this.supabase as any)
      .from('service_requests')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_by: opts.userId,
        form_data: nextFormData,
      })
      .eq('id', findingId)
      .select('*')
      .single();
    if (error) throw error;
    return this.toView(data);
  }

  /**
   * Reopen a rectified finding. Fan-out trigger fires server-side to REVOKE evidence.
   */
  static async reopen(findingId: string, opts: { reason: string; userId: string }): Promise<AuditFindingView> {
    const { data, error } = await (this.supabase as any)
      .from('service_requests')
      .update({
        status: 'in_review',
        closed_at: null,
        updated_by: opts.userId,
        form_data: (await this.get(findingId)).form_data,
        cancellation_reason: opts.reason,
      })
      .eq('id', findingId)
      .select('*')
      .single();
    if (error) throw error;
    return this.toView(data);
  }

  static async get(findingId: string): Promise<AuditFindingView> {
    const { data, error } = await (this.supabase as any)
      .from('service_requests')
      .select('*')
      .eq('id', findingId)
      .single();
    if (error) throw error;
    return this.toView(data);
  }

  private static toView(row: Record<string, unknown>): AuditFindingView {
    const formData = (row.form_data as AuditFindingFormData) ?? ({} as AuditFindingFormData);
    return {
      finding_id: row.id as string,
      request_number: (row.request_number as string) ?? null,
      audit_cycle_id: formData.audit_cycle_id,
      parameter_code: formData.parameter_code,
      severity: formData.severity,
      status: row.status as string,
      priority: (row.priority as string) ?? null,
      institution_id: row.institution_id as string,
      assigned_to: null,  // Note: service_requests.assigned_to not in schema — derived via approvals
      requester_id: row.requester_id as string,
      submitted_at: (row.submitted_at as string) ?? null,
      closed_at: (row.closed_at as string) ?? null,
      form_data: formData,
    };
  }
}
