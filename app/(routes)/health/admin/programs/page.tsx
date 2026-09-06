// app/(routes)/health/admin/programs/page.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Manager-facing list of all wellness programs + the create form.
// Gated on health.programs.manage. Spec: specs/health-wellness-programs-2026-06-15.md

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ProgramList } from './_components/program-list';
import { NoProgramsAccess } from './_components/no-access';

export const metadata: Metadata = {
  title: 'Wellness Programs — Manage',
  description:
    'Create and manage multi-day wellness programs: daily videos, quizzes, and impact.',
};

export default function HealthProgramsAdminPage() {
  return (
    <ContentLayout title="Wellness Programs">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Manage Programs' },
        ]}
      />
      <PermissionGuard
        module="health"
        action="programs.manage"
        fallback={<NoProgramsAccess />}
      >
        <div className="mt-4 space-y-6">
          <div>
            <h1 className="py-1 text-2xl font-bold text-slate-800">
              Wellness Programs
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">
              Build short, multi-day wellness programs — a daily video and an
              optional quiz per day. Open a program to manage its days, or view
              its impact to see who watched, completed, and found it useful.
            </p>
          </div>
          <ProgramList />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
