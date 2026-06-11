'use client';

// app/(routes)/ai-pulse/lab/page.tsx
// ============================================================================
// AI PULSE — OFFLINE LAB (index)
//
// SOP "Pulse to Practice" Phases III–IV (Lane E). Resolves the cycle the
// Monday Lab should evaluate (most recent cycle whose Thursday session has
// already happened) and forwards to /ai-pulse/lab/[cycle]. Shows an explicit
// empty state when no cycle exists.
//
// Permission gate: super_admin OR aiPulse:lab.score — explicit denied state,
// never a silent redirect (rule #27).
// ============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, CalendarOff, ArrowRight } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useLatestLabCycleId } from '@/lib/services/ai-pulse/lab-evaluation-service';

const LAB_SCORE_PERMISSION = 'aiPulse:lab.score';

export default function AiPulseLabIndexPage() {
  const router = useRouter();
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const canScore = isSuperAdmin || can(LAB_SCORE_PERMISSION);

  const { data: cycleId, isLoading: cycleLoading, error } = useLatestLabCycleId();

  useEffect(() => {
    if (!permsLoading && canScore && cycleId) {
      router.replace(`/ai-pulse/lab/${cycleId}`);
    }
  }, [permsLoading, canScore, cycleId, router]);

  if (permsLoading || (canScore && cycleLoading)) {
    return (
      <ContentLayout title="AI Pulse · Lab">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!canScore) {
    return (
      <ContentLayout title="AI Pulse · Lab">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>You don&apos;t have access</AlertTitle>
          <AlertDescription>
            The Lab evaluation console is for faculty evaluators. Required
            permission: <code className="font-mono">{LAB_SCORE_PERMISSION}</code>.
            Ask a super-admin to assign you the faculty evaluator role in Role
            Management.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="AI Pulse · Lab">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Could not find a cycle to evaluate</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!cycleId) {
    return (
      <ContentLayout title="AI Pulse · Lab">
        <PageBreadcrumb
          items={[{ label: 'AI Pulse', href: '/ai-pulse' }, { label: 'Lab' }]}
        />
        <Card className="mt-4 border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarOff className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">No AI Pulse cycle to evaluate yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The Lab console opens once a weekly cycle exists. Create the
              cycle from the Champion Console, run the Thursday session, then
              come back here to score the Monday presentations.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/ai-pulse/admin/cycles">
                Champion Console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // cycleId resolved — the useEffect above is performing router.replace.
  return (
    <ContentLayout title="AI Pulse · Lab">
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </ContentLayout>
  );
}
