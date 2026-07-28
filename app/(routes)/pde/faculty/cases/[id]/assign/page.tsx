import { createClient } from '@/lib/supabase/server';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { CaseAssignForm } from './_components/CaseAssignForm';

export const dynamic = 'force-dynamic';

/**
 * Faculty — assign a clinical case to sections + set its visibility.
 *
 * Model (specs/pde-case-assignment-design-2026-07-22.md): a case is OPEN by
 * default (every enrolled learner sees it). A Senior Learner can lock it to specific
 * sections, optionally with a due date; assigned learners get a nudge + a
 * pinned/highlighted card. All saving goes through /api/pde/cases/[id]/assign,
 * which enforces the author permission + case scope.
 */
export default async function CaseAssignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) {
    // Explicit access message — never a silent redirect (CLAUDE.md rule #27).
    return (
      <ContentLayout>
        <div className="mx-auto max-w-2xl py-12 px-4">
          <h1 className="text-xl font-semibold">You don&apos;t have access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {gate.message || 'Only clinical-case authors can assign cases. Contact your administrator if you think this is wrong.'}
          </p>
        </div>
      </ContentLayout>
    );
  }

  const { data: caseRow } = await (supabase as any)
    .from('pde_assessments')
    .select('id, title')
    .eq('id', id)
    .eq('assessment_type', 'clinical_case')
    .maybeSingle();

  if (!caseRow) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-2xl py-12 px-4">
          <h1 className="text-xl font-semibold">Case not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This clinical case doesn&apos;t exist or isn&apos;t one you can manage.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
          { label: caseRow.title, href: `/pde/faculty/cases/${id}` },
          { label: 'Assign' },
        ]}
      />
      <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
        <header className="rounded-lg border bg-card p-5 sm:p-6">
          <h1 className="text-xl font-semibold sm:text-2xl">Assign case</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{caseRow.title}</span> — choose who works
            on this case and when it&apos;s due.
          </p>
        </header>
        <CaseAssignForm caseId={id} />
      </div>
    </ContentLayout>
  );
}
