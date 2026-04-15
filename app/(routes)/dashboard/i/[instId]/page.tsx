/**
 * Dashboard v2 — Institution drill-down
 * Route: /dashboard/i/[instId]
 *
 * Day 2 (2026-04-15). Per-institution KPIs + breadcrumb.
 * Spec §7.5 multi-institution drill-down
 */

import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { createClient } from '@/lib/supabase/server';
import { getDashboardMetrics } from '@/lib/services/dashboard/dashboard-metrics-service';
import { HeroStrip } from '@/components/dashboard/hero-strip';
import { DashboardBreadcrumb } from '@/components/dashboard/dashboard-breadcrumb';

export const revalidate = 30;

async function getInstitution(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', id)
    .single();
  return data as { id: string; name: string } | null;
}

async function LiveHeroStrip({ institutionId }: { institutionId: string }) {
  const metrics = await getDashboardMetrics({ institutionId });
  return (
    <HeroStrip
      metrics={metrics}
      drillBase={`/dashboard/i/${institutionId}`}
    />
  );
}

function HeroSkeleton() {
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 p-5 animate-pulse'
        >
          <div className='h-3 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded' />
          <div className='mt-4 h-8 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded' />
        </div>
      ))}
    </div>
  );
}

export default async function InstitutionDashboardPage({
  params
}: {
  params: Promise<{ instId: string }>;
}) {
  const { instId } = await params;
  const inst = await getInstitution(instId);

  if (!inst) {
    notFound();
  }

  return (
    <ContentLayout title={`Dashboard — ${inst.name}`}>
      <div className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'>
        <div className='absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-white/20 to-sky-50/40 dark:from-emerald-950/30 dark:via-neutral-950/20 dark:to-sky-950/30' />
      </div>

      <div className='space-y-4 sm:space-y-5 lg:space-y-6 px-2 sm:px-3 lg:px-4 pb-10'>
        <DashboardBreadcrumb
          crumbs={[
            { label: 'JKKN', href: '/dashboard' },
            { label: inst.name, active: true }
          ]}
        />

        <div className='rounded-xl border border-sky-500/30 bg-sky-50/60 dark:bg-sky-950/20 p-3 text-xs'>
          <span className='font-semibold text-sky-900 dark:text-sky-100'>
            Scoped to {inst.name}
          </span>
          <span className='text-sky-800/70 dark:text-sky-200/70 ml-2'>
            · All metrics below are filtered to this institution only.{' '}
            <Link
              href='/dashboard'
              className='underline hover:text-sky-700'
            >
              Back to all JKKN
            </Link>
          </span>
        </div>

        <Suspense fallback={<HeroSkeleton />}>
          <LiveHeroStrip institutionId={instId} />
        </Suspense>

        {/* Department drill placeholder (Day 3) */}
        <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 p-6 text-center text-sm text-neutral-500'>
          Department drill-down arrives Day 3 —{' '}
          <code className='text-[11px]'>
            /dashboard/i/{instId.slice(0, 8)}…/d/[deptId]
          </code>
        </div>
      </div>
    </ContentLayout>
  );
}
