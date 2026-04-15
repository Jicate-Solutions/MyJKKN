'use client';

import { HeartPulse } from 'lucide-react';
import { CampusLivingComingSoon } from '../_components/coming-soon';

export default function CampusLivingWellnessPage() {
  return (
    <CampusLivingComingSoon
      title="Student Wellness"
      description="Pulse surveys, anonymous feedback collection, and critical-flag escalation so wardens can act before issues grow."
      feature="campus_living.wellness"
      icon={HeartPulse}
      bullets={[
        'Weekly pulse surveys (mood, sleep, food, homesickness) with configurable cadence',
        'Anonymous feedback channel routed to the right warden or mentor',
        'Automated critical-flag escalation (e.g. self-harm keywords, burnout signals)',
        'Counsellor dashboard with trend charts, at-risk lists, and intervention logs',
        'Per-block wellness scorecards to track mess, hygiene, and safety satisfaction',
      ]}
    />
  );
}
