'use client';
// app/(routes)/ai-pulse/admin/cycles/[id]/page.tsx
// Created: 2026-05-06
// Purpose: AI Pulse Champion Console — single-cycle edit view wrapper.
//          Permission gate is enforced inside CycleEditForm so the page itself
//          can render the breadcrumb chrome consistently.

import { use } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CycleEditForm } from '../_components/cycle-edit-form';
import { PublicationMetricsCard } from './_components/publication-metrics-card';
import { ParticipationCard } from './_components/participation-card';
import { JoinedLearnersCard } from './_components/joined-learners-card';
import { LearnerFeedbackCard } from './_components/learner-feedback-card';

interface Props {
  params: Promise<{ id: string }>;
}

export default function AIPulseCycleEditPage({ params }: Props) {
  const { id } = use(params);

  return (
    <ContentLayout title="AI Pulse — Edit cycle">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'Cycles', href: '/ai-pulse/admin/cycles' },
          { label: 'Edit' },
        ]}
      />
      <div className="mt-4 space-y-6">
        <CycleEditForm cycleId={id} />
        {/* Publication Metrics — SOP Phase V read path (2026-06-11) */}
        <PublicationMetricsCard cycleId={id} />
        {/* Participation — observable raw turnout, independent of engaged-rate (2026-06-18) */}
        <ParticipationCard cycleId={id} />
        {/* Who joined — named roster behind the turnout counts (2026-07-16) */}
        <JoinedLearnersCard cycleId={id} />
        {/* Learner feedback — CARE E-move voice channel (2026-06-12) */}
        <LearnerFeedbackCard cycleId={id} />
      </div>
    </ContentLayout>
  );
}
