'use client';

// app/(routes)/ai-pulse/lab/[cycle]/page.tsx
// ============================================================================
// AI PULSE — LAB EVALUATION CONSOLE (per-cycle)
//
// SOP "Pulse to Practice" Phases III–IV (Lane E). Faculty score the Monday
// Lab presentations (domain relevance + clarity, 1–10) and pick each
// department's Gold Standard teams (capped at the gold_standard_count
// policy). Selections persist ZERO-DDL into
// startup_events.config.ai_pulse.gold_selections and feed the NAAC
// Attribute 9 (Research & Innovation Outcomes) evidence export as
// "Faculty-selected" rows.
//
// Permission gates:
//   - Page:        super_admin OR aiPulse:lab.score (explicit 403, rule #27)
//   - Gold toggle: additionally super_admin OR aiPulse:gold.select
//
// Pattern source: app/(routes)/ai-pulse/admin/quiz/[cycle]/page.tsx
// ============================================================================

import { Suspense, use } from 'react';
import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Info } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

import { LabEvaluationConsole } from './_components/lab-evaluation-console';

const LAB_SCORE_PERMISSION = 'aiPulse:lab.score';
const GOLD_SELECT_PERMISSION = 'aiPulse:gold.select';

interface LabCyclePageProps {
  params: Promise<{ cycle: string }>;
}

export default function LabEvaluationPage({ params }: LabCyclePageProps) {
  const { cycle } = use(params);
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();

  const canScore = isSuperAdmin || can(LAB_SCORE_PERMISSION);
  const canSelectGold = isSuperAdmin || can(GOLD_SELECT_PERMISSION);

  if (permsLoading) {
    return (
      <ContentLayout title="AI Pulse · Lab Evaluation">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!canScore) {
    return (
      <ContentLayout title="AI Pulse · Lab Evaluation">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>You don&apos;t have access</AlertTitle>
          <AlertDescription>
            This console is restricted to faculty evaluators (and
            super-admins). Required permission:{' '}
            <code className="font-mono">{LAB_SCORE_PERMISSION}</code>. Ask a
            super-admin to assign you the faculty evaluator role in Role
            Management.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="AI Pulse · Lab Evaluation">
      <div className="flex items-center justify-between gap-4">
        <PageBreadcrumb
          items={[
            { label: 'AI Pulse', href: '/ai-pulse' },
            { label: 'Lab', href: '/ai-pulse/lab' },
            { label: 'Evaluate' },
          ]}
        />
        <Link
          href="/ai-pulse/guide"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          How this works
        </Link>
      </div>

      <Suspense fallback={null}>
        <LabEvaluationConsole cycleId={cycle} canSelectGold={canSelectGold} />
      </Suspense>
    </ContentLayout>
  );
}
