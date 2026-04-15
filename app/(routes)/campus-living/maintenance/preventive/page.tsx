'use client';

import { CalendarClock } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

export default function CampusLivingPreventiveMaintenancePage() {
  return (
    <CampusLivingComingSoon
      title="Preventive Maintenance"
      description="Schedule recurring maintenance (pest control, fire drills, electrical checks, plumbing audits) before failures happen."
      feature="campus_living.preventive_maintenance"
      icon={CalendarClock}
      bullets={[
        'Create PM schedules per block, asset, or facility type',
        'Auto-generate work tasks from schedules on due dates',
        'Track SLA adherence and recurring failure patterns',
        'Notify wardens, vendors, and block coordinators on trigger',
        'Escalate missed PM cycles to facility managers',
      ]}
    />
  );
}
