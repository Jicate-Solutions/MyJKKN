'use client';

/**
 * General Settings — /campus-living/settings/general
 *
 * Wired 2026-04-24 (Agent G — settings real-save). Previous page (Agent D,
 * PR #449) was display-only with all inputs disabled because the
 * `hostel_general_settings` table didn't exist. Agent F ships the table in
 * a parallel PR; this page now reads + writes against it.
 *
 * 2026-06-30: the editor body was extracted, behavior-preserving, into the
 * chrome-less `<GeneralSettingsSection />` so it can be embedded inside the
 * unified Campus Living config sections (which can't host a page that wraps
 * its own ContentLayout). This page keeps its ContentLayout chrome and renders
 * the section in place of the former inline body.
 *
 * Permission gate: `campus_living.settings.edit` or super_admin (enforced
 * inside the section component, unchanged).
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { GeneralSettingsSection } from './_components/-general-settings-section';

export default function GeneralSettingsPage() {
  return (
    <ContentLayout title="General Settings">
      <GeneralSettingsSection />
    </ContentLayout>
  );
}
