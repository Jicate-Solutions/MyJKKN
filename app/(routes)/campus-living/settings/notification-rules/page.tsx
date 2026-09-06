'use client';

/**
 * Notification Rules — /campus-living/settings/notification-rules
 *
 * Wired 2026-04-24 (Agent G — settings real-save). Previous page (Agent D,
 * PR #449) was display-only with a `PreviewBanner` because the
 * `hostel_notification_rules` table didn't exist yet. Agent F ships the
 * table in a parallel PR; this page now reads + writes against it.
 *
 * 2026-06-30: the editor body was extracted (behavior-preserving) into the
 * chrome-less <NotificationRulesSection /> component so it can be inlined
 * inside the unified Campus Living config sections. This page keeps its exact
 * chrome (ContentLayout title="Notification Rules") and delegates the working
 * body to the component — the standalone page renders identically.
 *
 * Permission gate: `campus_living.settings.edit` or super_admin (enforced
 * inside the section via canEdit).
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { NotificationRulesSection } from './_components/-notification-rules-section';

export default function NotificationRulesPage() {
  return (
    <ContentLayout title="Notification Rules">
      <NotificationRulesSection />
    </ContentLayout>
  );
}
