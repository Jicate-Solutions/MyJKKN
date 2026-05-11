// app/(routes)/ai-pulse/admin/cycles/page.tsx
// Created: 2026-05-06
// Purpose: AI Pulse Champion Console — list view wrapper.
//          Krishnaveni (Champion) + Ranjith (Co-Champion) manage weekly cycles here.
//
// Permission: super_admin OR aiPulse:cycles.manage (PR #716).
// Spec: specs/myjkkn-ai-pulse-spec.md §5 ("Champion Console").

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CycleList } from './_components/cycle-list';

export const metadata: Metadata = {
  title: 'AI Pulse — Champion Console',
  description:
    'Manage weekly AI Pulse cycles: featured tool, briefing topic, host, Meet URL, recording.',
};

export default function AIPulseCyclesAdminPage() {
  return (
    <ContentLayout title="AI Pulse — Champion Console">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Cycles' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Champion Console</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Weekly AI Pulse cycles — set the featured tool, briefing topic,
            host, and links. Click a cycle to edit. The cycle-generation cron
            seeds shell rows automatically; this page is where the Champion
            fills them in.
          </p>
        </div>
        <CycleList />
      </div>
    </ContentLayout>
  );
}
