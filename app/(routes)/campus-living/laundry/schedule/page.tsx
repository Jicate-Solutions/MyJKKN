'use client';

import { CalendarClock } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

export default function LaundrySchedulePage() {
  return (
    <CampusLivingComingSoon
      title="Laundry Schedule"
      description="Plan weekly pickup and delivery windows per block, assign vendors, and auto-generate orders from recurring slots."
      feature="campus_living.laundry.schedule"
      icon={CalendarClock}
      backHref="/campus-living/laundry"
      backLabel="Back to Laundry"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Campus Living', href: '/campus-living' },
        { label: 'Laundry', href: '/campus-living/laundry' },
        { label: 'Schedule' },
      ]}
      bullets={[
        'Configure weekly pickup and delivery windows per block',
        'Assign service vendors and pickup staff',
        'Auto-create orders from recurring schedules',
        'Notify residents ahead of each pickup window',
      ]}
    />
  );
}
