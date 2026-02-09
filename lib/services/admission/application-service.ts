// lib/services/admission/application-service.ts
// Admission CRM Application Service - manages admission_applications table

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AdmissionApplication,
  CreateApplicationInput,
  UpdateApplicationInput,
  ApplicationStatus,
} from '@/types/admission';

export interface ApplicationFilters {
  institutionId?: string;
  leadId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ApplicationListResponse {
  data: AdmissionApplication[];
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
   */
  private static async generateApplicationNumber(institutionId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `APP-${year}-`;

    // Get the highest application number for the current year
    const { data, error } = await this.supabase
      .from('admission_applications')
      .select('application_number')
      .like('application_number', `${prefix}%`)
      .eq('institution_id', institutionId)
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
   * Get applications with filters and pagination
   */
  static async getApplications(filters: ApplicationFilters = {}): Promise<ApplicationListResponse> {
    let query = this.supabase
      .from('admission_applications')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.leadId) {
      query = query.eq('lead_id', filters.leadId);
    }
    if (filters.status && filters.status !== '_all') {
      query = query.eq('status', filters.status);
    }
    if (filters.search) {
      const s = filters.search.replace(/[%_\\]/g, '\\$&');
      // Only application_number is a flat column; personal details are in form_data JSONB
      query = query.ilike('application_number', `%${s}%`);
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[admission/applications] Error fetching applications:', error);
      throw new Error(`Failed to fetch applications: ${error.message}`);
    }

    return {
      data: (data || []) as AdmissionApplication[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single application by ID
   */
  static async getApplication(id: string): Promise<AdmissionApplication> {
    const { data, error } = await this.supabase
      .from('admission_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admission/applications] Error fetching application:', error);
      throw new Error(`Failed to fetch application: ${error.message}`);
    }

    return data as AdmissionApplication;
  }

  /**
   * Create an application from a lead.
   * Generates APP-number, links to lead, and advances lead funnel_stage.
   */
  static async createApplicationFromLead(input: CreateApplicationInput): Promise<AdmissionApplication> {
    const { data: { user } } = await this.supabase.auth.getUser();

    // Generate application number
    const applicationNumber = await this.generateApplicationNumber(input.institution_id);

    // Create the application record
    // Note: admission_applications table stores personal details in form_data JSONB
    const formData: Record<string, any> = {};
    if (input.full_name) formData.full_name = input.full_name;
    if (input.email) formData.email = input.email;
    if (input.phone) formData.phone = input.phone;
    if (input.date_of_birth) formData.date_of_birth = input.date_of_birth;
    if (input.gender) formData.gender = input.gender;
    if (input.address) formData.address = input.address;
    if (input.city) formData.city = input.city;
    if (input.state) formData.state = input.state;
    if (input.pincode) formData.pincode = input.pincode;
    if (input.father_name) formData.father_name = input.father_name;
    if (input.mother_name) formData.mother_name = input.mother_name;
    if (input.guardian_phone) formData.guardian_phone = input.guardian_phone;

    const insertData: any = {
      institution_id: input.institution_id,
      lead_id: input.lead_id,
      application_number: applicationNumber,
      status: 'draft' as ApplicationStatus,
      program_id: input.program_id,
      academic_year: input.batch_id || new Date().getFullYear().toString(),
      form_data: formData,
    };

    const { data, error } = await this.supabase
      .from('admission_applications')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[admission/applications] Error creating application:', error);
      throw new Error(`Failed to create application: ${error.message}`);
    }

    // Advance the lead's funnel_stage to 'application_started'
    if (input.lead_id) {
      const { error: leadError } = await this.supabase
        .from('admission_leads')
        .update({
          funnel_stage: 'application_started',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.lead_id);

      if (leadError) {
        console.warn('[admission/applications] Could not advance lead funnel_stage:', leadError.message);
      }

      // Log stage change in history
      await this.supabase
        .from('admission_lead_stage_history')
        .insert({
          lead_id: input.lead_id,
          from_stage: null, // We don't know the previous stage here
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
          description: `Application ${applicationNumber} was created from this lead`,
          created_by: user?.id || null,
        });
    }

    return data as AdmissionApplication;
  }

  /**
   * Update an application
   */
  static async updateApplication(id: string, updates: Partial<UpdateApplicationInput>): Promise<AdmissionApplication> {
    const { data, error } = await this.supabase
      .from('admission_applications')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/applications] Error updating application:', error);
      throw new Error(`Failed to update application: ${error.message}`);
    }

    return data as AdmissionApplication;
  }

  /**
   * Update application status
   */
  static async updateStatus(id: string, status: ApplicationStatus): Promise<AdmissionApplication> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    // Set submitted_at if moving to submitted
    if (status === 'submitted') {
      updateData.submitted_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('admission_applications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admission/applications] Error updating application status:', error);
      throw new Error(`Failed to update application status: ${error.message}`);
    }

    return data as AdmissionApplication;
  }

  /**
   * Delete an application
   */
  static async deleteApplication(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_applications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admission/applications] Error deleting application:', error);
      throw new Error(`Failed to delete application: ${error.message}`);
    }
  }
}
