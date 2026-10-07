/**
 * Payroll document settings (2026-10-07)
 *
 * The four constants the Salary Register's Bank Letter and Chairperson
 * Approval print that exist nowhere else in the schema — the letter reference
 * code, and the COLLEGE's own bank, branch and account number — plus the
 * signatory wording. One row per paying institution in
 * hr_payroll_document_settings, filled once by the HR Head.
 *
 * READ answers `saved: false` with SUGGESTED values when nobody has filled the
 * form yet, so the form opens pre-filled — ref code "JKKN" + the institution's
 * staff-code prefix (COP -> JKKNCOP, matching the hand-typed letters), bank =
 * the bank most staff accounts are held at. A suggestion is never used to print
 * a document; the documents route refuses until the row is saved.
 *
 * The caller passes the request-scoped client (withAuth's auth.supabase), so
 * RLS sees the real user: view to read, manage to write.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';
import type {
  HRPayrollDocumentSettings,
  PayrollDocumentSettingsInput,
  PayrollDocumentSettingsResponse,
} from '@/types/hr-payroll';

const COLUMNS =
  'hr_organization_id, institution_id, reference_code, non_teaching_suffix, bank_name, bank_branch, college_account_number, addressee_title, approval_salutation, submitter_title, approver_title, updated_at';

const DEFAULT_WORDING = {
  non_teaching_suffix: 'NT',
  addressee_title: 'The Manager',
  approval_salutation: 'Respected Madam',
  submitter_title: 'CAO',
  approver_title: 'CHAIRPERSON',
};

export class PayrollDocumentSettingsService {
  private static async loadOrganisation(
    supabase: SupabaseClient,
    hrOrganizationId: string,
  ): Promise<{ institutionId: string; staffCodePrefix: string | null }> {
    const { data, error } = await (supabase as any)
      .from('hr_organizations')
      .select('id, institution_id, institutions:institution_id(staff_code_prefix)')
      .eq('id', hrOrganizationId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load the institution: ${getErrorMessage(error)}`);
    if (!data?.institution_id) {
      throw new Error('That institution does not exist, or is not visible to this account.');
    }
    return {
      institutionId: data.institution_id,
      staffCodePrefix: data.institutions?.staff_code_prefix ?? null,
    };
  }

  /** The bank most current staff accounts are held at — the usual payroll bank. */
  private static async commonStaffBank(supabase: SupabaseClient): Promise<string> {
    const { data, error } = await (supabase as any)
      .from('hr_staff_bank_accounts')
      .select('bank_name')
      .is('superseded_by', null)
      .not('bank_name', 'is', null)
      .limit(2000);

    // A suggestion only — a refusal here must not block opening the form.
    if (error || !data) return '';
    const counts = new Map<string, number>();
    for (const row of data as { bank_name: string }[]) {
      const name = row.bank_name.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [name, count] of counts) {
      if (count > bestCount) {
        best = name;
        bestCount = count;
      }
    }
    return best;
  }

  static async get(
    supabase: SupabaseClient,
    hrOrganizationId: string,
  ): Promise<PayrollDocumentSettingsResponse> {
    const { data, error } = await (supabase as any)
      .from('hr_payroll_document_settings')
      .select(COLUMNS)
      .eq('hr_organization_id', hrOrganizationId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load the document settings: ${getErrorMessage(error)}`);
    if (data) return { saved: true, settings: data as HRPayrollDocumentSettings };

    const org = await PayrollDocumentSettingsService.loadOrganisation(supabase, hrOrganizationId);
    const bank = await PayrollDocumentSettingsService.commonStaffBank(supabase);
    return {
      saved: false,
      settings: {
        hr_organization_id: hrOrganizationId,
        institution_id: org.institutionId,
        reference_code: org.staffCodePrefix ? `JKKN${org.staffCodePrefix.trim().toUpperCase()}` : '',
        bank_name: bank,
        bank_branch: '',
        college_account_number: '',
        ...DEFAULT_WORDING,
        updated_at: null,
      },
    };
  }

  /**
   * Insert or update the one row for this institution. institution_id is
   * resolved from the organisation, never taken from the caller — the RLS
   * WITH CHECK pins the pair too.
   */
  static async upsert(
    supabase: SupabaseClient,
    hrOrganizationId: string,
    input: PayrollDocumentSettingsInput,
    userId: string | null,
  ): Promise<HRPayrollDocumentSettings> {
    const org = await PayrollDocumentSettingsService.loadOrganisation(supabase, hrOrganizationId);

    const row = {
      hr_organization_id: hrOrganizationId,
      institution_id: org.institutionId,
      reference_code: input.reference_code.trim(),
      non_teaching_suffix: input.non_teaching_suffix.trim(),
      bank_name: input.bank_name.trim(),
      bank_branch: input.bank_branch.trim(),
      college_account_number: input.college_account_number.trim(),
      addressee_title: input.addressee_title.trim(),
      approval_salutation: input.approval_salutation.trim(),
      submitter_title: input.submitter_title.trim(),
      approver_title: input.approver_title.trim(),
      updated_by: userId,
    };

    const { data: existing, error: findErr } = await (supabase as any)
      .from('hr_payroll_document_settings')
      .select('id')
      .eq('hr_organization_id', hrOrganizationId)
      .maybeSingle();
    if (findErr) throw new Error(`Failed to load the document settings: ${getErrorMessage(findErr)}`);

    const query = existing
      ? (supabase as any)
          .from('hr_payroll_document_settings')
          .update(row)
          .eq('id', existing.id)
      : (supabase as any)
          .from('hr_payroll_document_settings')
          .insert({ ...row, created_by: userId });

    const { data, error } = await query.select(COLUMNS).maybeSingle();
    if (error) throw new Error(`Failed to save the document settings: ${getErrorMessage(error)}`);
    // An UPDATE that RLS filters out returns no row and no error.
    if (!data) throw new Error('Saving the document settings was refused for this account.');
    return data as HRPayrollDocumentSettings;
  }
}
