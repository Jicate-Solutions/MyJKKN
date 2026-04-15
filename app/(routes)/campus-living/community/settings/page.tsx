'use client';

import { Settings2 } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

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
