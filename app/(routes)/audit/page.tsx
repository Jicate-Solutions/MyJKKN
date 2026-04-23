// app/(routes)/audit/page.tsx
// Audit module root — redirect to the Lead Auditor's dashboard home.
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §Routes

import { redirect } from 'next/navigation';

export default function AuditIndexPage() {
  redirect('/audit/dashboard');
}
