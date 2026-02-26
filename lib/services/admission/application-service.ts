// lib/services/admission/application-service.ts
// Admission CRM Application Service - queries admission_leads table
// Applications are now tracked as leads with funnel_stage >= 'application_started'

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionLead,
  CreateApplicationInput,
  UpdateApplicationInput,
  FunnelStage,
} from '@/types/admission';

// Funnel stages that count as "applications"
export const APPLICATION_STAGES: FunnelStage[] = [
  'application_started',
  'application_submitted',
  'documents_pending',
  'documents_verified',
  'interview_scheduled',
  'interview_completed',
  'offer_sent',
  'offer_accepted',
  'token_paid',
  'enrolled',
  'confirmed',
];

export interface ApplicationFilters {
  institutionId?: string;
  status?: string; // maps to funnel_stage
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  date_from?: string;
  date_to?: string;
}

export interface ApplicationListResponse {
  data: AdmissionLead[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class ApplicationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  /**
   * Generate a unique application number: APP-YYYY-XXXXXX
   * Queries admission_leads for the highest application_number in the current year.
   */
  private static async generateApplicationNumber(institutionId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `APP-${year}-`;

    // Get the highest application number for the current year
    const { data, error } = await this.supabase
      .from('admission_leads')
      .select('application_number')
      .eq('institution_id', institutionId)
      .like('application_number', `${prefix}%`)
      .order('application_number', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[admission/applications] Error getting latest application number:', error);
    }

    let nextNum = 1;
    if (data && data.length > 0) {
      const lastNum = data[0].application_number.replace(prefix, '');
      const parsed = parseInt(lastNum, 10);
      if (!isNaN(parsed)) {
        nextNum = parsed + 1;
      }
    }

    return `${prefix}${nextNum.toString().padStart(6, '0')}`;
  }

  /**
   * Get applications with filters and pagination.
   * Queries admission_leads where funnel_stage is in APPLICATION_STAGES.
   */
  static async getApplications(filters: ApplicationFilters = {}): Promise<ApplicationListResponse> {
    let query = this.supabase
      .from('admission_leads')
      .select(
        '*, counselor:profiles!admission_leads_assigned_counselor_id_fkey(id,full_name,email)',
        { count: 'exact' }
      );

    // Always filter to application-stage leads
    if (filters.status && filters.status !== '_all') {
      // When a specific status (funnel_stage) is provided, filter by that stage only
      query = query.eq('funnel_stage', filters.status);
    } else {
      // Otherwise show all application-stage leads
      query = query.in('funnel_stage', APPLICATION_STAGES);
    }

    // Institution filter
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }

    // Search across application_number, full_name, email, phone
    if (filters.search) {
      const s = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.or(
        `application_number.ilike.%${s}%,full_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`
      );
    }

    // Date range filters
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // Sorting
    const sortBy = filters.sort_by || 'created_at';
    const ascending = (filters.sort_order || 'desc') === 'asc';

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sortBy, { ascending }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[admission/applications] Error fetching applications:', error);
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return {
      data: (data || []) as AdmissionLead[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single application (lead) by ID with counselor join.
   */
  static async getApplication(id: string): Promise<AdmissionLead> {
    const { data, error } = await this.supabase
      .from('admission_leads')
      .select(
        '*, counselor:profiles!admission_leads_assigned_counselor_id_fkey(id,full_name,email)'
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/applications] Error fetching application:', error);
      throw new Error(`Failed to fetch application: ${error.message}`);
    }

    return data as AdmissionLead;
  }

  /**
   * Create an application from a lead.
   * Updates the admission_leads record with degree, department, program,
   * application number, and sets funnel_stage to 'application_started'.
   */
  static async createApplicationFromLead(input: CreateApplicationInput): Promise<AdmissionLead> {
    const { data: { user } } = await this.supabase.auth.getUser();

    // Check for duplicate: if the lead already has an application_number
    const { data: existingLead, error: fetchError } = await this.supabase
      .from('admission_leads')
      .select('id, application_number, funnel_stage')
      .eq('id', input.lead_id)
      .single();

    if (fetchError) {
      console.error('[admission/applications] Error fetching lead:', fetchError);
      throw new Error(`Failed to fetch lead: ${fetchError.message}`);
    }

    if (existingLead?.application_number) {
      throw new Error('This lead already has an application');
    }

    // Generate application number
    const applicationNumber = await this.generateApplicationNumber(input.institution_id);

    const previousStage = existingLead?.funnel_stage || null;

    // Update the lead record with application details
    const { data, error } = await this.supabase
      .from('admission_leads')
      .update({
        degree_id: input.degree_id,
        department_id: input.department_id,
        program_id: input.program_id,
        application_number: applicationNumber,
        funnel_stage: 'application_started' as FunnelStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.lead_id)
      .select('*, counselor:profiles!admission_leads_assigned_counselor_id_fkey(id,full_name,email)')
      .single();

    if (error) {
      console.error('[admission/applications] Error creating application:', error);
      throw new Error(`Failed to create application: ${error.message}`);
    }

    // Log stage change in history
    await this.supabase
      .from('admission_lead_stage_history')
      .insert({
        lead_id: input.lead_id,
        from_stage: previousStage,
        to_stage: 'application_started',
        changed_by: user?.id || null,
        notes: `Application ${applicationNumber} created`,
        created_at: new Date().toISOString(),
      });

    // Log activity on the lead
    await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: input.lead_id,
        activity_type: 'note',
        subject: 'Application Created',
        description: `Application ${applicationNumber} was created for this lead`,
        created_by: user?.id || null,
      });

    return data as AdmissionLead;
  }

  /**
   * Update an application (lead) record.
   */
  static async updateApplication(id: string, updates: Partial<UpdateApplicationInput>): Promise<AdmissionLead> {
    const { data, error } = await this.supabase
      .from('admission_leads')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, counselor:profiles!admission_leads_assigned_counselor_id_fkey(id,full_name,email)')
      .single();

    if (error) {
      console.error('[admission/applications] Error updating application:', error);
      throw new Error(`Failed to update application: ${error.message}`);
    }

    return data as AdmissionLead;
  }

  /**
   * Update application status by setting funnel_stage on the lead.
   */
  static async updateStatus(id: string, status: FunnelStage): Promise<AdmissionLead> {
    const { data: { user } } = await this.supabase.auth.getUser();

    // Get the current stage for history logging
    const { data: currentLead } = await this.supabase
      .from('admission_leads')
      .select('funnel_stage')
      .eq('id', id)
      .single();

    const previousStage = currentLead?.funnel_stage || null;

    const { data, error } = await this.supabase
      .from('admission_leads')
      .update({
        funnel_stage: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, counselor:profiles!admission_leads_assigned_counselor_id_fkey(id,full_name,email)')
      .single();

    if (error) {
      console.error('[admission/applications] Error updating application status:', error);
      throw new Error(`Failed to update application status: ${error.message}`);
    }

    // Log stage change in history
    if (previousStage !== status) {
      await this.supabase
        .from('admission_lead_stage_history')
        .insert({
          lead_id: id,
          from_stage: previousStage,
          to_stage: status,
          changed_by: user?.id || null,
          notes: `Application status changed from ${previousStage} to ${status}`,
          created_at: new Date().toISOString(),
        });
    }

    return data as AdmissionLead;
  }

  /**
   * Delete an application by resetting the lead.
   * Clears application fields and sets funnel_stage back to 'qualified'.
   */
  static async deleteApplication(id: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();

    // Get current state for history logging
    const { data: currentLead } = await this.supabase
      .from('admission_leads')
      .select('funnel_stage, application_number')
      .eq('id', id)
      .single();

    const previousStage = currentLead?.funnel_stage || null;
    const appNumber = currentLead?.application_number || 'unknown';

    const { error } = await this.supabase
      .from('admission_leads')
      .update({
        degree_id: null,
        department_id: null,
        program_id: null,
        application_number: null,
        funnel_stage: 'qualified' as FunnelStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[admission/applications] Error resetting application:', error);
      throw new Error(`Failed to delete application: ${error.message}`);
    }

    // Log stage change in history
    await this.supabase
      .from('admission_lead_stage_history')
      .insert({
        lead_id: id,
        from_stage: previousStage,
        to_stage: 'qualified',
        changed_by: user?.id || null,
        notes: `Application ${appNumber} was removed, lead reset to qualified`,
        created_at: new Date().toISOString(),
      });

    // Log activity
    await this.supabase
      .from('admission_lead_activities')
      .insert({
        lead_id: id,
        activity_type: 'note',
        subject: 'Application Removed',
        description: `Application ${appNumber} was removed and lead was reset to qualified stage`,
        created_by: user?.id || null,
      });
  }
}
