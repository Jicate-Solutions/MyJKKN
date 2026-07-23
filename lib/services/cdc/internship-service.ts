// lib/services/cdc/internship-service.ts
// CDC Sprint 4 — Corporate internship service
// Uses the Supabase client-side client for browser calls (via hook) and
// the server client when invoked from API routes.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  InternshipAssignmentDetail,
  InternshipCertificate,
  CdcInternshipFilters,
  CdcInternshipListResponse,
  CreateCorporateInternshipPayload,
  IssueCertificatePayload,
} from '@/types/cdc/internships';

// Shared select fragment: assignment + site + certificate
const ASSIGNMENT_SELECT = `
  id,
  institution_id,
  cycle_id,
  learner_id,
  site_id,
  facilitator_id,
  preceptor_id,
  program_id,
  department_rotation,
  rotation_start_date,
  rotation_end_date,
  assignment_join_date,
  required_attendance_pct,
  status,
  internship_type,
  internship_type_id,
  total_days,
  days_present,
  attendance_percentage,
  overall_grade,
  offer_letter_url,
  created_at,
  updated_at,
  created_by,
  updated_by,
  site:internship_external_sites (
    id,
    institution_id,
    site_name,
    internship_type,
    city,
    state,
    address_line1,
    is_active,
    operates_weekends,
    created_at
  ),
  certificate:internship_certificates (
    id,
    institution_id,
    assignment_id,
    certificate_number,
    issued_date,
    attendance_percentage,
    evaluation_average,
    certificate_pdf_url,
    verification_url,
    is_revoked,
    created_at,
    created_by
  )
` as const;

// Last-resort fallback if the policy row is missing/inactive. The policy
// (cdc.min_attendance_pct_for_internship_certificate) is the primary source;
// this literal exists only so the service never throws when the row is absent.
const FALLBACK_REQUIRED_ATTENDANCE_PCT = 75;

export class CdcInternshipService {
  private static getClient() {
    return createClientSupabaseClient();
  }

  /**
   * Default "required attendance %" for an internship, sourced from the
   * canonical platform_policies row rather than a hardcoded literal.
   * Mirrors the certificate route's read idiom (global / active / number),
   * coalescing to FALLBACK_REQUIRED_ATTENDANCE_PCT only if the row is absent.
   */
  static async getDefaultRequiredAttendancePct(): Promise<number> {
    const supabase = this.getClient();
    const { data: policyRow } = await (supabase as any)
      .from('platform_policies')
      .select('value')
      .eq('policy_key', 'cdc.min_attendance_pct_for_internship_certificate')
      .eq('scope_type', 'global')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const parsed = Number(policyRow?.value);
    return Number.isFinite(parsed) ? parsed : FALLBACK_REQUIRED_ATTENDANCE_PCT;
  }

  static async listInternships(
    filters: CdcInternshipFilters = {}
  ): Promise<CdcInternshipListResponse> {
    const supabase = this.getClient();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = (supabase as any)
      .from('internship_assignments')
      .select(ASSIGNMENT_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.internship_type) {
      query = query.eq('internship_type', filters.internship_type);
    } else {
      // Default to corporate only for the CDC UI
      query = query.eq('internship_type', 'corporate_internship');
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: (data ?? []) as InternshipAssignmentDetail[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  static async getInternship(id: string): Promise<InternshipAssignmentDetail | null> {
    const supabase = this.getClient();
    const { data, error } = await (supabase as any)
      .from('internship_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw new Error(error.message);
    }
    return data as InternshipAssignmentDetail;
  }

  static async createCorporateInternship(
    payload: CreateCorporateInternshipPayload,
    institutionId: string
  ): Promise<InternshipAssignmentDetail> {
    const supabase = this.getClient();
    // Service is authoritative for the default: when the form omits the value,
    // source it from the policy (not a hardcoded literal).
    const requiredAttendancePct =
      payload.required_attendance_pct ?? (await this.getDefaultRequiredAttendancePct());
    const { data, error } = await (supabase as any)
      .from('internship_assignments')
      .insert({
        institution_id: institutionId,
        cycle_id: payload.cycle_id,
        learner_id: payload.learner_id,
        site_id: payload.site_id,
        facilitator_id: payload.facilitator_id,
        rotation_start_date: payload.rotation_start_date,
        rotation_end_date: payload.rotation_end_date,
        required_attendance_pct: requiredAttendancePct,
        department_rotation: payload.department_rotation ?? null,
        // BUG-004087: optional offer-letter document URL
        offer_letter_url: payload.offer_letter_url ?? null,
        internship_type: 'corporate_internship',
        status: 'pending',
      })
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as InternshipAssignmentDetail;
  }

  static async updateStatus(
    id: string,
    status: string
  ): Promise<InternshipAssignmentDetail> {
    const supabase = this.getClient();
    const { data, error } = await (supabase as any)
      .from('internship_assignments')
      .update({ status })
      .eq('id', id)
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as InternshipAssignmentDetail;
  }

  static async issueCertificate(
    assignmentId: string,
    payload: IssueCertificatePayload,
    institutionId: string
  ): Promise<InternshipCertificate> {
    const supabase = this.getClient();

    // Generate certificate number: CDC-YYYY-<random 6-digit>
    const certNum = `CDC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    // Public verification page — allowlisted in proxy.ts as '/verify/*' and the
    // LinkedIn "See credential" target, so it MUST resolve without login. The old
    // value pointed at the Supabase project domain + a non-existent gated page.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.jkkn.ai';
    const verificationUrl = `${baseUrl}/verify/${certNum}`;

    const { data, error } = await (supabase as any)
      .from('internship_certificates')
      .insert({
        institution_id: institutionId,
        assignment_id: assignmentId,
        certificate_number: certNum,
        attendance_percentage: payload.attendance_percentage,
        evaluation_average: payload.evaluation_average,
        competencies_passed: payload.competencies_passed ?? 0,
        competencies_total: payload.competencies_total ?? 0,
        certificate_pdf_url: payload.certificate_pdf_url ?? null,
        verification_url: verificationUrl,
        is_revoked: false,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as InternshipCertificate;
  }

  static async getInternshipCycles(institutionId: string) {
    const supabase = this.getClient();
    const { data, error } = await (supabase as any)
      .from('internship_posting_cycles')
      .select('id, cycle_name, start_date, end_date, status')
      .eq('institution_id', institutionId)
      .order('start_date', { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  static async getCorporateSites(institutionId: string) {
    const supabase = this.getClient();
    const { data, error } = await (supabase as any)
      .from('internship_external_sites')
      .select('id, site_name, city, state')
      .eq('institution_id', institutionId)
      .eq('internship_type', 'corporate_internship')
      .eq('is_active', true)
      .order('site_name', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
