'use client';

/**
 * Maintenance SLA — /campus-living/settings/maintenance-sla
 *
 * Wired 2026-04-24 (Agent D — settings real-save). Before today the
 * category x priority SLA grid had NO persistence; the Save button only
 * showed a warning toast. Chief wardens thought they were configuring
 * SLAs for 2+ months and maintenance tickets kept using whatever the DB
 * held. Now persists to `hostel_maintenance_sla_config` (one row per
 * category x priority) via batch upsert.
 *
 * Permission gate: `campus_living.settings.edit` (or super-admin).
 *
 * The editor body now lives in a chrome-less <MaintenanceSlaSection />
 * (./_components/-maintenance-sla-section) so it can be embedded inside the
 * unified Campus Living config sections without nesting a second
 * ContentLayout. This page keeps only its outer chrome (ContentLayout) and
 * delegates the working body to that component — the standalone route renders
 * identically.
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { MaintenanceSlaSection } from './_components/-maintenance-sla-section';

export default function MaintenanceSlaPage() {
  return (
    <ContentLayout title="Maintenance SLA">
      <MaintenanceSlaSection />
    </ContentLayout>
  );
}
