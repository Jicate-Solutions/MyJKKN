// ============================================================================
// HR RECRUITMENT — Jobs admin UI.
// Created: 2026-05-09 (Tier 1 decomposition T1.1).
// Reworked: 2026-06-25 — moved off the policy-shell LookupTable onto the shared
// advanced DataTable (server pagination/sort/search, column controls, row
// selection + bulk delete) with a dedicated filter bar. The create/edit modal
// and all the CRUD wiring live in _components/jobs-data-table.tsx.
//
// Permission gate: hr.recruitment.view (dynamic Role Management key) — was
// admin_or_super_admin, which wrongly locked out custom roles like COO that
// hold every hr.recruitment.* grant. Mutations resolve through the existing
// hr.recruitment.{view,create,edit,delete} grants enforced by RLS.
// ============================================================================

'use client';

import { PolicyPageShell } from '@/lib/admin/policy-shell';

import { JobsDataTable } from './_components/jobs-data-table';

const EXPLAINER = (
  <>
    <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
    <p>
      Job postings drive the recruitment pipeline. Each posting carries a role
      category, optional department scope, and a salary range, and belongs to one
      college. Candidates submitted under a posting inherit its role category for
      the approval chain.
    </p>
    <p className="mt-2">
      Set status to <strong>Open</strong> and turn on{' '}
      <strong>Public on /careers</strong> to expose the role on the
      unauthenticated careers page. Setting status to <strong>Closed</strong> or{' '}
      <strong>Filled</strong> hides it again.
    </p>
  </>
);

export default function HRRecruitmentJobsPage() {
  return (
    <PolicyPageShell
      title="Recruitment — Job Postings"
      explainer={EXPLAINER}
      permissionKey="hr.recruitment.view"
    >
      <JobsDataTable />
    </PolicyPageShell>
  );
}
