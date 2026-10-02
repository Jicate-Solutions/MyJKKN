// ============================================================================
// HR SALARY SUGGESTION RULE — Policy Editor (Super-Admin)
// ============================================================================
// The Director's amounts behind "Suggest a revised salary" on Employee
// Salaries: rupees per year at JKKN for EACH DEPARTMENT, on one page (years
// before JKKN count at half). Stored as `hr.salary_suggestion_rule` in
// platform_policies (one group-wide row), read and written only through
// /api/hr/payroll/salary-suggestion-rule. Super admins may open it and look;
// ONLY the Director list may change it (ruling of 30 Sep 2026). Starts blank:
// an empty department gets no suggestion.
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
            This page is restricted to super administrators. It holds pay amounts, and only the
            Director changes them.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='HR Salary Suggestion — amounts per department'>
        <SalarySuggestionRuleEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
