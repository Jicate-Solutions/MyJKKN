// app/(routes)/health/admin/programs/[id]/surveys/[surveyId]/report/page.tsx
// Created: 2026-09-28 — Health & Wellness → program-scoped surveys (admin).
// Gated on health.programs.manage (RLS on health_surveys / _responses enforces
// the same key independently).

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SurveyReport } from '../../_components/survey-report';
import { NoProgramsAccess } from '../../../../_components/no-access';

export const metadata: Metadata = {
  title: 'Wellness Survey Report',
};

interface PageProps {
  params: Promise<{ id: string; surveyId: string }>;
}

export default async function Page({ params }: PageProps) {
  const p = await params;

  return (
    <ContentLayout title="Wellness Survey Report">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Manage Programs', href: '/health/admin/programs' },
          { label: 'Surveys', href: `/health/admin/programs/${p.id}/surveys` },
          { label: 'Report' },
        ]}
      />
      <PermissionGuard
        module="health"
        action="programs.manage"
        fallback={<NoProgramsAccess />}
      >
        <div className="mt-4 space-y-4">
          <div>
            <h1 className="py-1 text-2xl font-bold text-slate-800">Survey report</h1>
            <p className="text-sm text-slate-500 sm:text-base">Individual responses and summary analytics. Export both to Excel.</p>
          </div>
          <SurveyReport programId={p.id} surveyId={p.surveyId} />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
