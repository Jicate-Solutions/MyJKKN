'use client';

// app/(routes)/ai-pulse/admin/reports/page.tsx
// ============================================================================
// AI PULSE — CHAMPION REVIEW QUEUE (Director moderation decisions #3, #8, #10)
//
// "REPORT SPEED = a champion decides — reported feed prompts route to a senior
//  learner to decide; NO auto-hide."
//
// Two queues live here, because they are the same job for the same audience:
//   Tab "Reported"     — learners flagged it after it appeared        (#3)
//   Tab "AI-rejected"  — the automatic checker refused it            (#8)
// and above both, the safety-check heartbeat card                    (#10),
// which is the only place on the platform that can tell "the */10 cron stopped"
// apart from "nobody is writing prompts".
//
// Route:        /ai-pulse/admin/reports
// Permission:   super_admin OR aiPulse:anomaly.review  (registered at
//               lib/constants/permissions.ts — no new key invented, so Role
//               Management can actually grant it)
// Service:      lib/services/ai-pulse/champion-report-queue-service.ts
// Substrate:    migration 20260804120000_ai_pulse_champion_review_queue.sql
//
// WHICH PERMISSION — Director's retarget (2026-08-04): "Only the 3 designated
// AI Pulse champions should open the moderation page and decide on reported
// prompts." aiPulse:anomaly.review is what the purpose-built ai_pulse_champion
// role actually holds, and it is the key the sibling champion console
// /ai-pulse/admin/anomalies already enforces. The Monday-Lab scoring key this
// page first shipped with is held by ~587 staff and would have exposed reported
// prompt text plus author names to all of them. The two decision RPCs behind
// the buttons were WIDENED to accept this key too (same migration, section 3) —
// retargeting the read alone would have left both buttons raising 42501.
//
// Explicit denied state, never a silent redirect (rule #27) — mirrors the
// sibling consoles at /ai-pulse/lab and /ai-pulse/admin/anomalies. NOTE: like
// every page in this module the gate is CLIENT-side (usePermissions), so the
// ContentLayout shell paints before it resolves; there is no server-side page
// guard pattern in this repo to adopt (lib/auth/with-auth.ts wraps API routes,
// and SuperAdminOnly is itself a client component). A server guard for the
// whole /ai-pulse/admin subtree is a follow-up, not this PR — the RPC's own
// runtime guard is the real boundary, so nothing leaks either way.
// ============================================================================

import { ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';

import { ReportQueueList } from './_components/report-queue-list';
import { SafetyHealthCard } from './_components/safety-health-card';
import { SafetyReviewList } from './_components/safety-review-list';

const CHAMPION_PERMISSION = 'aiPulse:anomaly.review';

export default function AiPulseReportQueuePage() {
  const { isSuperAdmin, can, isLoading } = usePermissions([], { waitForLoad: true });
  const allowed = isSuperAdmin || can(CHAMPION_PERMISSION);

  if (isLoading) {
    return (
      <ContentLayout title='AI Pulse · Reported Prompts'>
        <div className='space-y-3'>
          <Skeleton className='h-8 w-48' />
          <Skeleton className='h-32 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout title='AI Pulse · Reported Prompts'>
        <Alert variant='destructive'>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>You don&apos;t have access</AlertTitle>
          <AlertDescription>
            Reviewing reported prompts is a champion responsibility. Required
            permission: <code className='font-mono'>{CHAMPION_PERMISSION}</code>.
            Ask a super admin to grant it in Role Management.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='AI Pulse · Reported Prompts'>
      <PageBreadcrumb
        items={[
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Reported Prompts' },
        ]}
      />
      <div className='mt-4 space-y-6'>
        <SafetyHealthCard />

        <Tabs defaultValue='reported'>
          <TabsList>
            <TabsTrigger value='reported'>Reported</TabsTrigger>
            <TabsTrigger value='ai-rejected'>AI-rejected</TabsTrigger>
          </TabsList>
          <TabsContent value='reported' className='mt-4'>
            <ReportQueueList />
          </TabsContent>
          <TabsContent value='ai-rejected' className='mt-4'>
            <SafetyReviewList />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
