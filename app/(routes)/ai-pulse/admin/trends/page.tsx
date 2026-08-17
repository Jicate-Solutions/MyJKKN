// app/(routes)/ai-pulse/admin/trends/page.tsx
// Created: 2026-08-13
// Purpose: AI Pulse Champion Console — the session trend ACROSS cycles.
//          Krishnaveni (Champion) + Ranjith (Co-Champion) could previously only
//          inspect one cycle at a time, which cannot answer "did last week's
//          change help?".
//
// Permission: enforced by the shared ../layout.tsx (RoutePermissionGuard), which
//             reads this route's key from MENU_PERMISSIONS in lib/sidebarMenuLink.ts.
//             This route declares `aiPulse:anomaly.review` — the same key as the
//             sibling champion read surfaces (/admin/anomalies, /admin/reports),
//             and the key the ai_pulse_live_attendance SELECT policy honours, so
//             the gate and the data agree. See pulse-trends-service.ts.
// Service:    lib/services/ai-pulse/pulse-trends-service.ts (read-only).

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { TrendsView } from './_components/trends-view';

export const metadata: Metadata = {
  title: 'AI Pulse — Session trend',
  description:
    'Week-over-week movement in AI Pulse session turnout, quiz take-up, retention and feedback.',
};

export default function AIPulseTrendsPage() {
  return (
    <ContentLayout title="AI Pulse — Session trend">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Session trend' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Session trend</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Every cycle side by side, with the change against the week before. Use
            it to check whether what you changed last week moved anything, then
            decide what to change for the next session.
          </p>
        </div>
        <TrendsView />
      </div>
    </ContentLayout>
  );
}
