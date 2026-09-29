// ============================================================================
// HR SALARY SUGGESTION RULE — Policy Editor (Super-Admin)
// ============================================================================
// The Director's rule behind "Suggest a revised salary" on Employee Salaries:
// rupees per year at JKKN, per year before JKKN, and other things that count.
// Stored as `hr.salary_suggestion_rule` in platform_policies, per college or
// group-wide, read and written only through /api/hr/payroll/salary-suggestion-rule.
// Super-admin only, like Pay Scales — these are pay amounts. Starts blank: until
// it is published, every suggestion reads "rule not set".
// ============================================================================

export const navMeta = {
  label: 'Salary Suggestion',
  icon: 'Sparkles',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { SalarySuggestionRuleEditor } from './_components/salary-suggestion-rule-editor';

export default function HrSalarySuggestionRulePage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title='HR Salary Suggestion'>
          <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
            This page is restricted to super administrators. The salary suggestion rule holds pay
            amounts, so only the Director sets it.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='HR Salary Suggestion — the rule behind suggested salaries'>
        <SalarySuggestionRuleEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
