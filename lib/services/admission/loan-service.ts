// lib/services/admission/loan-service.ts
// Service for Loan Connect & Financial Aid feature

import { createClientSupabaseClient } from '@/lib/supabase/client';

// =============================================================================
// TYPES
// =============================================================================

export interface LoanPartner {
  id: string;
  institution_id: string;
  name: string;
  logo_url: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  interest_rate_min: number | null;
  interest_rate_max: number | null;
  max_loan_amount: number | null;
  processing_fee_percent: number | null;
  max_tenure_months: number;
  collateral_required: boolean;
  documents_required: string[] | null;
  is_active: boolean;
  approval_rate: number | null;
  avg_processing_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  active_applications_count?: number;
}

export interface CreatePartnerInput {
  name: string;
  logo_url?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  interest_rate_min?: number;
  interest_rate_max?: number;
  max_loan_amount?: number;
  processing_fee_percent?: number;
  max_tenure_months?: number;
  collateral_required?: boolean;
  documents_required?: string[];
  approval_rate?: number;
  avg_processing_days?: number;
  notes?: string;
}

export interface UpdatePartnerInput extends Partial<CreatePartnerInput> {
  is_active?: boolean;
}

export type LoanApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'documents_pending'
  | 'approved'
  | 'disbursed'
  | 'rejected';

export interface LoanApplication {
  id: string;
  institution_id: string;
  lead_id: string;
  partner_id: string;
  loan_amount: number;
  tenure_months: number;
  interest_rate: number | null;
  emi_amount: number | null;
  status: LoanApplicationStatus;
  applied_at: string | null;
  decision_at: string | null;
  decision_notes: string | null;
  documents_submitted: string[] | null;
  counselor_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  lead?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    funnel_stage: string | null;
  };
  partner?: LoanPartner;
}

export interface CreateApplicationInput {
  lead_id: string;
  partner_id: string;
  loan_amount: number;
  tenure_months: number;
  interest_rate?: number;
  emi_amount?: number;
  notes?: string;
  counselor_id?: string;
}

export interface UpdateApplicationInput {
  loan_amount?: number;
  tenure_months?: number;
  interest_rate?: number;
  emi_amount?: number;
  status?: LoanApplicationStatus;
  decision_notes?: string;
  documents_submitted?: string[];
  notes?: string;
  counselor_id?: string;
}

export interface LoanApplicationFilters {
  status?: LoanApplicationStatus;
  partner_id?: string;
  search?: string;
}

export interface PartnerAnalytics {
  partner_id: string;
  partner_name: string;
  total_applications: number;
  approved: number;
  rejected: number;
  disbursed: number;
  pending: number;
  approval_rate: number;
  total_disbursed_amount: number;
  avg_loan_amount: number;
}

export interface LoanAnalyticsSummary {
  total_applications: number;
  approved: number;
  rejected: number;
  disbursed: number;
  pending: number;
  total_disbursed_amount: number;
  avg_processing_days: number;
  partner_analytics: PartnerAnalytics[];
  status_distribution: { status: string; count: number }[];
  monthly_trend: { month: string; applications: number; approved: number; disbursed: number }[];
}

// =============================================================================
// SERVICE
// =============================================================================

export class LoanService {
  // ---------------------------------------------------------------------------
  // PARTNERS
  // ---------------------------------------------------------------------------

  static async getPartners(institutionId: string): Promise<LoanPartner[]> {
    const supabase = createClientSupabaseClient();
    const { data: partners, error } = await (supabase as any)
      .from('admission_loan_partners')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get application counts per partner
    const { data: appCounts, error: appError } = await (supabase as any)
      .from('admission_loan_applications')
      .select('partner_id, status')
      .eq('institution_id', institutionId);

    if (appError) throw appError;

    const countMap = new Map<string, number>();
    for (const app of appCounts || []) {
      if (!['rejected', 'draft'].includes(app.status)) {
        countMap.set(app.partner_id, (countMap.get(app.partner_id) || 0) + 1);
      }
    }

    return (partners || []).map((p: any) => ({
      ...p,
      active_applications_count: countMap.get(p.id) || 0,
    }));
  }

  static async getPartner(partnerId: string): Promise<LoanPartner> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_loan_partners')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (error) throw error;
    return data;
  }

  static async createPartner(
    institutionId: string,
    input: CreatePartnerInput
  ): Promise<LoanPartner> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_loan_partners')
      .insert({
        institution_id: institutionId,
        name: input.name,
        logo_url: input.logo_url || null,
        contact_person: input.contact_person || null,
        contact_email: input.contact_email || null,
        contact_phone: input.contact_phone || null,
        interest_rate_min: input.interest_rate_min ?? null,
        interest_rate_max: input.interest_rate_max ?? null,
        max_loan_amount: input.max_loan_amount ?? null,
        processing_fee_percent: input.processing_fee_percent ?? null,
        max_tenure_months: input.max_tenure_months ?? 120,
        collateral_required: input.collateral_required ?? false,
        documents_required: input.documents_required || null,
        approval_rate: input.approval_rate ?? null,
        avg_processing_days: input.avg_processing_days ?? null,
        notes: input.notes || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updatePartner(
    partnerId: string,
    input: UpdatePartnerInput
  ): Promise<LoanPartner> {
    const supabase = createClientSupabaseClient();
    const updateData: Record<string, any> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.logo_url !== undefined) updateData.logo_url = input.logo_url;
    if (input.contact_person !== undefined) updateData.contact_person = input.contact_person;
    if (input.contact_email !== undefined) updateData.contact_email = input.contact_email;
    if (input.contact_phone !== undefined) updateData.contact_phone = input.contact_phone;
    if (input.interest_rate_min !== undefined) updateData.interest_rate_min = input.interest_rate_min;
    if (input.interest_rate_max !== undefined) updateData.interest_rate_max = input.interest_rate_max;
    if (input.max_loan_amount !== undefined) updateData.max_loan_amount = input.max_loan_amount;
    if (input.processing_fee_percent !== undefined) updateData.processing_fee_percent = input.processing_fee_percent;
    if (input.max_tenure_months !== undefined) updateData.max_tenure_months = input.max_tenure_months;
    if (input.collateral_required !== undefined) updateData.collateral_required = input.collateral_required;
    if (input.documents_required !== undefined) updateData.documents_required = input.documents_required;
    if (input.approval_rate !== undefined) updateData.approval_rate = input.approval_rate;
    if (input.avg_processing_days !== undefined) updateData.avg_processing_days = input.avg_processing_days;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await (supabase as any)
      .from('admission_loan_partners')
      .update(updateData)
      .eq('id', partnerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deletePartner(partnerId: string): Promise<void> {
    // Soft delete by setting is_active = false
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('admission_loan_partners')
      .update({ is_active: false })
      .eq('id', partnerId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // APPLICATIONS
  // ---------------------------------------------------------------------------

  static async getApplications(
    institutionId: string,
    filters?: LoanApplicationFilters
  ): Promise<LoanApplication[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('admission_loan_applications')
      .select(`
        *,
        lead:admission_leads(id, full_name, email, phone, funnel_stage),
        partner:admission_loan_partners(id, name, logo_url, interest_rate_min, interest_rate_max, max_loan_amount)
      `)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.partner_id) {
      query = query.eq('partner_id', filters.partner_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    let results = data || [];

    // Client-side search filter on lead name
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      results = results.filter((app: any) =>
        app.lead?.full_name?.toLowerCase().includes(searchLower)
      );
    }

    return results;
  }

  static async getApplication(applicationId: string): Promise<LoanApplication> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('admission_loan_applications')
      .select(`
        *,
        lead:admission_leads(id, full_name, email, phone, funnel_stage),
        partner:admission_loan_partners(id, name, logo_url, interest_rate_min, interest_rate_max, max_loan_amount)
      `)
      .eq('id', applicationId)
      .single();

    if (error) throw error;
    return data;
  }

  static async createApplication(
    institutionId: string,
    input: CreateApplicationInput
  ): Promise<LoanApplication> {
    const supabase = createClientSupabaseClient();

    // Calculate EMI if interest rate is available
    let emiAmount = input.emi_amount;
    if (!emiAmount && input.interest_rate && input.interest_rate > 0) {
      emiAmount = LoanService.calculateEMI(
        input.loan_amount,
        input.interest_rate,
        input.tenure_months
      );
    }

    const { data, error } = await (supabase as any)
      .from('admission_loan_applications')
      .insert({
        institution_id: institutionId,
        lead_id: input.lead_id,
        partner_id: input.partner_id,
        loan_amount: input.loan_amount,
        tenure_months: input.tenure_months,
        interest_rate: input.interest_rate ?? null,
        emi_amount: emiAmount ?? null,
        status: 'draft',
        notes: input.notes || null,
        counselor_id: input.counselor_id || null,
        applied_at: new Date().toISOString(),
      })
      .select(`
        *,
        lead:admission_leads(id, full_name, email, phone, funnel_stage),
        partner:admission_loan_partners(id, name, logo_url, interest_rate_min, interest_rate_max, max_loan_amount)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateApplication(
    applicationId: string,
    input: UpdateApplicationInput
  ): Promise<LoanApplication> {
    const supabase = createClientSupabaseClient();
    const updateData: Record<string, any> = {};

    if (input.loan_amount !== undefined) updateData.loan_amount = input.loan_amount;
    if (input.tenure_months !== undefined) updateData.tenure_months = input.tenure_months;
    if (input.interest_rate !== undefined) updateData.interest_rate = input.interest_rate;
    if (input.emi_amount !== undefined) updateData.emi_amount = input.emi_amount;
    if (input.status !== undefined) {
      updateData.status = input.status;
      // Set decision timestamp for terminal statuses
      if (['approved', 'rejected', 'disbursed'].includes(input.status)) {
        updateData.decision_at = new Date().toISOString();
      }
      // Set applied_at when moving to submitted
      if (input.status === 'submitted') {
        updateData.applied_at = new Date().toISOString();
      }
    }
    if (input.decision_notes !== undefined) updateData.decision_notes = input.decision_notes;
    if (input.documents_submitted !== undefined) updateData.documents_submitted = input.documents_submitted;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.counselor_id !== undefined) updateData.counselor_id = input.counselor_id;

    const { data, error } = await (supabase as any)
      .from('admission_loan_applications')
      .update(updateData)
      .eq('id', applicationId)
      .select(`
        *,
        lead:admission_leads(id, full_name, email, phone, funnel_stage),
        partner:admission_loan_partners(id, name, logo_url, interest_rate_min, interest_rate_max, max_loan_amount)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteApplication(applicationId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('admission_loan_applications')
      .delete()
      .eq('id', applicationId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // ANALYTICS
  // ---------------------------------------------------------------------------

  static async getAnalytics(institutionId: string): Promise<LoanAnalyticsSummary> {
    const supabase = createClientSupabaseClient();

    // Fetch all applications with partner info
    const { data: applications, error } = await (supabase as any)
      .from('admission_loan_applications')
      .select(`
        id, loan_amount, status, created_at, applied_at, decision_at, partner_id,
        partner:admission_loan_partners(id, name)
      `)
      .eq('institution_id', institutionId);

    if (error) throw error;

    const apps = applications || [];

    // Summary stats
    const total_applications = apps.length;
    const approved = apps.filter((a: any) => a.status === 'approved').length;
    const rejected = apps.filter((a: any) => a.status === 'rejected').length;
    const disbursed = apps.filter((a: any) => a.status === 'disbursed').length;
    const pending = apps.filter((a: any) =>
      ['draft', 'submitted', 'under_review', 'documents_pending'].includes(a.status)
    ).length;

    const total_disbursed_amount = apps
      .filter((a: any) => a.status === 'disbursed')
      .reduce((sum: number, a: any) => sum + (Number(a.loan_amount) || 0), 0);

    // Avg processing days (applied_at -> decision_at for decided apps)
    const decidedApps = apps.filter((a: any) => a.applied_at && a.decision_at);
    const avg_processing_days = decidedApps.length > 0
      ? decidedApps.reduce((sum: number, a: any) => {
          const days = (new Date(a.decision_at).getTime() - new Date(a.applied_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / decidedApps.length
      : 0;

    // Partner-wise analytics
    const partnerMap = new Map<string, PartnerAnalytics>();
    for (const app of apps) {
      const pid = app.partner_id;
      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partner_id: pid,
          partner_name: app.partner?.name || 'Unknown',
          total_applications: 0,
          approved: 0,
          rejected: 0,
          disbursed: 0,
          pending: 0,
          approval_rate: 0,
          total_disbursed_amount: 0,
          avg_loan_amount: 0,
        });
      }
      const pa = partnerMap.get(pid)!;
      pa.total_applications++;
      if (app.status === 'approved') pa.approved++;
      if (app.status === 'rejected') pa.rejected++;
      if (app.status === 'disbursed') {
        pa.disbursed++;
        pa.total_disbursed_amount += Number(app.loan_amount) || 0;
      }
      if (['draft', 'submitted', 'under_review', 'documents_pending'].includes(app.status)) {
        pa.pending++;
      }
    }

    const partner_analytics = Array.from(partnerMap.values()).map((pa) => {
      const decided = pa.approved + pa.rejected + pa.disbursed;
      pa.approval_rate = decided > 0 ? Math.round(((pa.approved + pa.disbursed) / decided) * 100) : 0;
      pa.avg_loan_amount = pa.total_applications > 0
        ? apps
            .filter((a: any) => a.partner_id === pa.partner_id)
            .reduce((sum: number, a: any) => sum + (Number(a.loan_amount) || 0), 0) / pa.total_applications
        : 0;
      return pa;
    });

    // Status distribution
    const statusCounts = new Map<string, number>();
    for (const app of apps) {
      statusCounts.set(app.status, (statusCounts.get(app.status) || 0) + 1);
    }
    const status_distribution = Array.from(statusCounts.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // Monthly trend (last 6 months)
    const monthly_trend: { month: string; applications: number; approved: number; disbursed: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthLabel = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });

      const monthApps = apps.filter((a: any) => {
        const appDate = new Date(a.created_at);
        return appDate.getFullYear() === d.getFullYear() && appDate.getMonth() === d.getMonth();
      });

      monthly_trend.push({
        month: monthLabel,
        applications: monthApps.length,
        approved: monthApps.filter((a: any) => a.status === 'approved').length,
        disbursed: monthApps.filter((a: any) => a.status === 'disbursed').length,
      });
    }

    return {
      total_applications,
      approved,
      rejected,
      disbursed,
      pending,
      total_disbursed_amount,
      avg_processing_days: Math.round(avg_processing_days),
      partner_analytics,
      status_distribution,
      monthly_trend,
    };
  }

  // ---------------------------------------------------------------------------
  // EMI CALCULATOR (pure function, no DB)
  // ---------------------------------------------------------------------------

  /**
   * EMI = P x r x (1+r)^n / ((1+r)^n - 1)
   * where P = principal, r = monthly interest rate, n = tenure in months
   */
  static calculateEMI(principal: number, annualRate: number, tenureMonths: number): number {
    if (principal <= 0 || tenureMonths <= 0) return 0;
    if (annualRate <= 0) return principal / tenureMonths; // No interest

    const r = annualRate / 12 / 100; // Monthly rate
    const n = tenureMonths;
    const emi = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return Math.round(emi * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get total interest payable
   */
  static calculateTotalInterest(principal: number, annualRate: number, tenureMonths: number): number {
    const emi = LoanService.calculateEMI(principal, annualRate, tenureMonths);
    const totalPayment = emi * tenureMonths;
    return Math.round((totalPayment - principal) * 100) / 100;
  }

  /**
   * Get total payment (principal + interest)
   */
  static calculateTotalPayment(principal: number, annualRate: number, tenureMonths: number): number {
    const emi = LoanService.calculateEMI(principal, annualRate, tenureMonths);
    return Math.round(emi * tenureMonths * 100) / 100;
  }
}
