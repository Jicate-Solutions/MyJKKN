// ============================================
// STAFF "OFFICE" SECTION — payer + salary + bank account on the staff form
// ============================================
// Created: 2026-09-26
// The staff create/edit form carries these as a nested `office` object. It is
// never written to `staff`; after the staff row is saved, saveStaffOffice()
// writes each filled part through the SAME services the HR payroll pages use
// (hr_staff_payroll upsert, fn_hr_set_staff_salary, fn_hr_set_staff_bank_account),
// so RLS and the supersede/no-op rules are identical on both screens.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';
import { StaffPayrollService } from '@/lib/services/hr/payroll/staff-payroll-service';
import {
  StaffSalaryService,
  type StaffSalaryRow,
} from '@/lib/services/hr/payroll/staff-salary-service';
import {
  StaffBankAccountService,
  type StaffBankAccountHistoryRow,
} from '@/lib/services/hr/payroll/staff-bank-account-service';
import {
  normaliseAccountNumber,
  normaliseIfsc,
} from '@/lib/hr/payroll/bank-account-validation';

export const SALARY_STRUCTURES = ['Monthly', 'Weekly', 'Daily', 'Hourly'] as const;
export const OVERTIME_LEVELS = ['No overtime', 'Grade', 'Employee'] as const;

/** Numbers are held as strings while typing; converted on save. */
export interface OfficeSalaryValues {
  monthly_gross: string;
  salary_structure: string;
  effective_from: string; // yyyy-mm-dd
  overtime_level: string;
  overtime_amount: string;
  eligible_for_pf: boolean;
  exempt_edli: boolean;
  eligible_for_insurance: boolean;
  eligible_for_gratuity: boolean;
  eligible_for_etf: boolean;
  eligible_for_esi: boolean;
  epf_amount: string;
  esi_amount: string;
  allowance_amount: string;
  allowance_label: string;
  notes: string;
}

export interface OfficeBankValues {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string;
  account_type: string;
  effective_from: string; // yyyy-mm-dd, blank = today (RPC default)
  notes: string;
}

export interface OfficeValues {
  payer_org_id: string;
  salary: OfficeSalaryValues;
  bank: OfficeBankValues;
}

export function emptyOfficeValues(): OfficeValues {
  return {
    payer_org_id: '',
    salary: {
      monthly_gross: '',
      salary_structure: 'Monthly',
      effective_from: '',
      overtime_level: 'No overtime',
      overtime_amount: '',
      eligible_for_pf: false,
      exempt_edli: false,
      eligible_for_insurance: false,
      eligible_for_gratuity: false,
      eligible_for_etf: false,
      eligible_for_esi: false,
      epf_amount: '',
      esi_amount: '',
      allowance_amount: '',
      allowance_label: '',
      notes: '',
    },
    bank: {
      account_holder_name: '',
      account_number: '',
      ifsc_code: '',
      bank_name: '',
      branch_name: '',
      account_type: 'savings',
      effective_from: '',
      notes: '',
    },
  };
}

const str = (v: number | string | null | undefined) =>
  v === null || v === undefined || Number(v) === 0 ? '' : String(v);

/** Pre-fill for the edit form from what is on record today. */
export function officeValuesFromRecords(
  payerOrgId: string | null | undefined,
  salary: StaffSalaryRow | null | undefined,
  bank: StaffBankAccountHistoryRow | null | undefined
): OfficeValues {
  const v = emptyOfficeValues();
  v.payer_org_id = payerOrgId ?? '';
  if (salary) {
    v.salary = {
      monthly_gross: str(salary.monthly_gross),
      salary_structure: salary.salary_structure || 'Monthly',
      effective_from: salary.effective_from ?? '',
      overtime_level: salary.overtime_level || 'No overtime',
      overtime_amount: str(salary.overtime_amount),
      eligible_for_pf: !!salary.eligible_for_pf,
      exempt_edli: !!salary.exempt_edli,
      eligible_for_insurance: !!salary.eligible_for_insurance,
      eligible_for_gratuity: !!salary.eligible_for_gratuity,
      eligible_for_etf: !!salary.eligible_for_etf,
      eligible_for_esi: !!salary.eligible_for_esi,
      epf_amount: str(salary.epf_amount),
      esi_amount: str(salary.esi_amount),
      allowance_amount: str(salary.allowance_amount),
      allowance_label: salary.allowance_label ?? '',
      notes: salary.notes ?? '',
    };
  }
  if (bank) {
    v.bank = {
      account_holder_name: bank.account_holder_name ?? '',
      account_number: bank.account_number ?? '',
      ifsc_code: bank.ifsc_code ?? '',
      bank_name: bank.bank_name ?? '',
      branch_name: bank.branch_name ?? '',
      account_type: bank.account_type || 'savings',
      effective_from: bank.effective_from ?? '',
      notes: bank.notes ?? '',
    };
  }
  return v;
}

/** A salary counts as entered once any money field is typed. */
export function isSalaryEntered(s: Partial<OfficeSalaryValues> | undefined): boolean {
  if (!s) return false;
  return [s.monthly_gross, s.overtime_amount, s.epf_amount, s.esi_amount, s.allowance_amount]
    .some((x) => (x ?? '').toString().trim() !== '');
}

export function isBankEntered(b: Partial<OfficeBankValues> | undefined): boolean {
  if (!b) return false;
  return [b.account_holder_name, b.account_number, b.ifsc_code, b.bank_name, b.branch_name]
    .some((x) => (x ?? '').trim() !== '');
}

const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

export interface OfficeSaveResult {
  /** One human-readable line per part that failed; empty = everything saved. */
  failures: string[];
  savedAny: boolean;
}

/**
 * Write the filled parts, in dependency order: payer, then salary (which needs
 * the payer org), then bank account. Each part fails independently so one
 * problem does not throw away the others. Salary and bank RPCs are no-ops when
 * nothing differs, so re-saving an unchanged edit adds no history rows.
 */
export async function saveStaffOffice(
  supabase: SupabaseClient,
  staffId: string,
  office: OfficeValues,
  initialPayerOrgId: string | null
): Promise<OfficeSaveResult> {
  const failures: string[] = [];
  let savedAny = false;
  const payer = office.payer_org_id?.trim() || '';

  if (payer && payer !== (initialPayerOrgId ?? '')) {
    try {
      await StaffPayrollService.setPayer(supabase, staffId, payer);
      savedAny = true;
    } catch (e) {
      failures.push(`Payroll organisation: ${getErrorMessage(e)}`);
    }
  }

  if (isSalaryEntered(office.salary)) {
    const s = office.salary;
    try {
      await StaffSalaryService.setSalary(supabase, {
        staffId,
        hrOrganizationId: payer,
        monthlyGross: num(s.monthly_gross),
        effectiveFrom: s.effective_from,
        salaryStructure: s.salary_structure,
        overtimeLevel: s.overtime_level,
        overtimeAmount: num(s.overtime_amount),
        eligibleForPf: s.eligible_for_pf,
        exemptEdli: s.exempt_edli,
        eligibleForInsurance: s.eligible_for_insurance,
        eligibleForGratuity: s.eligible_for_gratuity,
        eligibleForEtf: s.eligible_for_etf,
        epfAmount: s.eligible_for_pf ? num(s.epf_amount) : 0,
        eligibleForEsi: s.eligible_for_esi,
        esiAmount: s.eligible_for_esi ? num(s.esi_amount) : 0,
        allowanceAmount: num(s.allowance_amount),
        allowanceLabel: s.allowance_label.trim() || null,
        notes: s.notes.trim() || null,
      });
      savedAny = true;
    } catch (e) {
      failures.push(`Salary: ${getErrorMessage(e)}`);
    }
  }

  if (isBankEntered(office.bank)) {
    const b = office.bank;
    try {
      await StaffBankAccountService.setAccount(supabase, {
        staffId,
        accountHolderName: b.account_holder_name.trim(),
        accountNumber: normaliseAccountNumber(b.account_number),
        ifscCode: normaliseIfsc(b.ifsc_code) || null,
        bankName: b.bank_name.trim() || null,
        branchName: b.branch_name.trim() || null,
        accountType: b.account_type || 'savings',
        effectiveFrom: b.effective_from || undefined,
        notes: b.notes.trim() || null,
      });
      savedAny = true;
    } catch (e) {
      failures.push(`Bank account: ${getErrorMessage(e)}`);
    }
  }

  return { failures, savedAny };
}
