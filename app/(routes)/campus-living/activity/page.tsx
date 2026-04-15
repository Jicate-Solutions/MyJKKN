'use client';

import { Activity } from 'lucide-react';
import { CampusLivingComingSoon } from '../_components/coming-soon';

export default function CampusLivingActivityPage() {
  return (
    <CampusLivingComingSoon
      title="Activity Feed"
      description="Real-time stream of attendance, leave, gate-pass, maintenance, and incident events across all hostels."
      feature="campus_living.activity"
      icon={Activity}
      bullets={[
        'Filter activity by block, event type, or time range',
        'See who marked attendance, approved leaves, and closed tickets',
        'Drill into each event to view before/after state',
        'Subscribe to activity digests by email or in-app',
      ]}
    />
  );
}
