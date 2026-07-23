'use client';

// Created: 2026-07-20 — AI Pulse "Domain Starter" self-improving loop.
// Admin surface: Tamil native-review of AI-generated starter prompts.
//
// Route:       /ai-pulse/admin/starter-tamil-review
// Permission:  super_admin OR AI Pulse cycle-management access
//              (mirrors the RPC's own server-side gate).
// RPCs:        fn_ai_pulse_domain_starters_pending_tamil (list)
//              fn_ai_pulse_domain_starter_ta_review     (approve / reject)
//
// DARK: the whole Domain Starter feature is behind the kill switch
// (ai_pulse_policies 'domain_starter_enabled' = false). This reviewer surface
// renders, but no learner sees a starter until the switch is flipped on.
//
// Gating pattern mirrors the sibling Anomaly Review console
// (app/(routes)/ai-pulse/admin/anomalies/page.tsx). The RPCs are also gated
// server-side, so a non-admin gets an error regardless — this page-level gate
// is for UX (a clean "restricted" message instead of a failed query).

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';

import { StarterTamilReviewList } from './_components/tamil-review-list';

// Same key the RPC checks (is_super_admin() OR is_admin() OR this key).
// Not printed in the UI — the terminology gate flags raw permission keys.
const CYCLE_MANAGE_KEY = 'aiPulse:cycles.manage';

export default function StarterTamilReviewPage() {
  const { isSuperAdmin, isLoading, can } = usePermissions([], {
    waitForLoad: true,
  });

  const allowed = isSuperAdmin || can(CYCLE_MANAGE_KEY);

  if (isLoading) {
    return (
      <ContentLayout title='AI Pulse — Tamil Review'>
        <div className='space-y-3'>
          <Skeleton className='h-8 w-48' />
          <Skeleton className='h-32 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout title='AI Pulse — Tamil Review'>
        <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
          This page is restricted to AI Pulse Champions and super
          administrators. If you should have access, ask a super admin to grant
          you AI Pulse cycle-management access.
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='AI Pulse — Tamil Review'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Tamil Review' },
        ]}
      />
      <div className='mt-4'>
        <StarterTamilReviewList />
      </div>
    </ContentLayout>
  );
}
