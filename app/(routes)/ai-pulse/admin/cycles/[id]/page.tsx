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
      <div className="mt-4">
        <CycleEditForm cycleId={id} />
      </div>
    </ContentLayout>
  );
}
