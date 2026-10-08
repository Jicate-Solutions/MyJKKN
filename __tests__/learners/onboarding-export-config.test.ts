import { describe, it, expect } from 'vitest';
import { buildExcelRows } from '@/components/data-table/utils/export-utils';
import {
  getOnboardingExportConfig,
  transformOnboardingRow
} from '@/app/(routes)/learners/onboarding/_components/onboarding-export-config';
import type { OnboardingProfileRow } from '@/types/learner-onboarding';

const base = {
  id: 'l1',
  first_name: 'Asha',
  last_name: 'R',
  roll_number: '26CS001',
  register_number: 'R1',
  college_email: 'asha@jkkn.ac.in',
  student_email: 'asha@gmail.com',
  student_mobile: '9000000000',
  lifecycle_status: 'admitted',
  institution: { name: 'JKKN College of Engineering' },
  program: { program_name: 'B.E. CSE' },
  admission_year_obj: { admission_year_name: '2026', year: 2026 },
  missing_fields: ['section_id'],
  missing_field_labels: ['Section'],
  missing_count: 1,
  filled_count: 3,
  completion_percent: 75,
  tier: 'almost',
  can_activate: false,
  activation_blocked_reason: 'Profile incomplete'
} as unknown as OnboardingProfileRow;

describe('onboarding export config', () => {
  it('writes every header as a populated column (headers are data keys, not labels)', () => {
    const cfg = getOnboardingExportConfig('almost');
    const { rows, resolvedKeys } = buildExcelRows(
      [base],
      cfg.headers,
      cfg.columnMapping,
      cfg.transformFunction
    );
    expect(resolvedKeys).toEqual(cfg.headers);
    expect(rows[0]['Learner Name']).toBe('Asha R');
    expect(rows[0]['Institution']).toBe('JKKN College of Engineering');
    expect(rows[0]['Missing Fields']).toBe('Section');
    expect(rows[0]['Completion']).toBe('3/4');
    expect(rows[0]['Onboarding Tier']).toBe('Almost Complete');
    expect(cfg.columnWidths).toHaveLength(cfg.headers.length);
  });

  it('swaps triage columns for fee columns only on awaiting_payment', () => {
    expect(getOnboardingExportConfig('critical').headers).not.toContain('fees_due');
    const pay = getOnboardingExportConfig('awaiting_payment').headers;
    expect(pay).toContain('fees_due');
    expect(pay).not.toContain('missing_fields');
  });

  it('leaves fee cells blank, not 0, when fee data is missing', () => {
    const out = transformOnboardingRow({ ...base, tier: 'awaiting_payment' });
    expect(out.fees_balance).toBe('');
    expect(out.amount_to_threshold).toBe('');
  });
});
