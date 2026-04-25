'use client';

import { Settings2 } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip (settings cog). Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/community',
} as const;

export default function CampusLivingCommunitySettingsPage() {
  return (
    <CampusLivingComingSoon
      title="Community Settings"
      description="Configure moderation rules, allowed content types, and notification defaults for the hostel community."
      feature="campus_living.community_settings"
      icon={Settings2}
      bullets={[
        'Toggle feature flags: noticeboard, events, polls, peer chat',
        'Define banned keywords and auto-moderation thresholds',
        'Set per-block moderator lists and escalation contacts',
        'Control default notification channels (push, email, in-app)',
        'Audit log of config changes with actor and timestamp',
      ]}
    />
  );
}
