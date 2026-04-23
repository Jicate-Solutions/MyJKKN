'use client';

import { ListChecks } from 'lucide-react';
import { CampusLivingComingSoon } from '../../../_components/coming-soon';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/maintenance/preventive',
} as const;

export default function CampusLivingPreventiveMaintenanceTasksPage() {
  return (
    <CampusLivingComingSoon
      title="PM Tasks"
      description="Auto-generated preventive maintenance tasks from active schedules. Assign, track, and close them with proof."
      feature="campus_living.pm_tasks"
      icon={ListChecks}
      bullets={[
        'Kanban board of pending / in-progress / closed PM tasks',
        'Bulk assign to vendors or in-house technicians',
        'Attach completion photos and signed checklists',
        'Auto-reopen if next cycle triggers before current closes',
        'Filter by block, asset, SLA breach, and overdue days',
      ]}
    />
  );
}
