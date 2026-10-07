/**
 * Payroll document settings — one schema for the form and the route handler,
 * so the dialog refuses exactly what the server would. Limits mirror the CHECK
 * constraints on hr_payroll_document_settings (20271007120000).
 */

import { z } from 'zod';

const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const payrollDocumentSettingsSchema = z.object({
  reference_code: required('Reference code', 40),
  non_teaching_suffix: z.string().trim().max(10, 'Suffix must be 10 characters or fewer'),
  bank_name: required('Bank name', 120),
  bank_branch: required('Branch', 120),
  college_account_number: required('College account number', 40),
  addressee_title: required('Addressee', 80),
  approval_salutation: required('Salutation', 80),
  submitter_title: required('Submitted by', 60),
  approver_title: required('Approved by', 60),
});

export type PayrollDocumentSettingsFormValues = z.infer<typeof payrollDocumentSettingsSchema>;
