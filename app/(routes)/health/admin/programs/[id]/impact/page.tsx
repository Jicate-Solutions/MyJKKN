// app/(routes)/health/admin/programs/[id]/impact/page.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Impact dashboard for one program — reach, engagement, learning, usefulness,
// adoption lift, plus the active policy that produced the numbers.
// Gated on health.programs.manage; the impact RPC enforces its own gate too.
// Spec: specs/health-wellness-programs-2026-06-15.md

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ImpactDashboard } from './_components/impact-dashboard';
import { NoProgramsAccess } from '../../_components/no-access';

export const metadata: Metadata = {
  title: 'Wellness Program Impact',
  description:
    'Reach, engagement, learning, usefulness, and adoption lift for a wellness program.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HealthProgramImpactPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <ContentLayout title="Wellness Program Impact">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Manage Programs', href: '/health/admin/programs' },
          { label: 'Impact' },
        ]}
      />
      <PermissionGuard
        module="health"
        action="programs.manage"
        fallback={<NoProgramsAccess />}
      >
        <div className="mt-4 space-y-2">
          <div>
            <h1 className="py-1 text-2xl font-bold text-slate-800">
              Program impact
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">
              What this program achieved — in people, not just clicks.
            </p>
          </div>
          <div className="pt-2">
            <ImpactDashboard programId={id} />
          </div>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
