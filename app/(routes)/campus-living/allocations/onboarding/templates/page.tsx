'use client';

import { FileStack } from 'lucide-react';
import { CampusLivingComingSoon } from '../../../_components/coming-soon';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/allocations/onboarding',
} as const;

export default function CampusLivingOnboardingTemplatesPage() {
  return (
    <CampusLivingComingSoon
      title="Onboarding Templates"
      description="Define reusable onboarding checklists per institution, block type, or hosteller category."
      feature="campus_living.onboarding_templates"
      icon={FileStack}
      bullets={[
        'Create / clone / version templates with drag-to-reorder items',
        'Per-item SLA hours, owner role, and evidence requirements',
        'Set default template per block type (boys / girls / PG / staff)',
        'Preview generated checklist before publishing template',
        'Activation / archival workflow with audit trail',
      ]}
    />
  );
}
