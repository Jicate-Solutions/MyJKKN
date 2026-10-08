// app/(routes)/health/admin/programs/[id]/surveys/page.tsx
// Created: 2026-09-28 — Health & Wellness → program-scoped surveys (admin).
// Gated on health.programs.manage (RLS on health_surveys / _responses enforces
// the same key independently).

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { SurveyList } from './_components/survey-list';
import { NoProgramsAccess } from '../../_components/no-access';

export const metadata: Metadata = {
  title: 'Wellness Surveys',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const p = await params;

  return (
    <ContentLayout title="Wellness Surveys">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Manage Programs', href: '/health/admin/programs' },
          { label: 'Surveys' },
        ]}
      />
      <PermissionGuard
        module="health"
        action="programs.manage"
        fallback={<NoProgramsAccess />}
      >
        <div className="mt-4 space-y-4">
          <div>
            <h1 className="py-1 text-2xl font-bold text-slate-800">Program surveys</h1>
            <p className="text-sm text-slate-500 sm:text-base">Scenario surveys attached to this program. Respondents pick the program, answer each scenario with an instant review, and submit once.</p>
          </div>
          <SurveyList programId={p.id} />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
