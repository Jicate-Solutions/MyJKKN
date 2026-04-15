'use client';

import { Settings2 } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

export default function LaundrySettingsPage() {
  return (
    <CampusLivingComingSoon
      title="Laundry Settings"
      description="Configure service types, pricing, turnaround commitments and vendor contracts for the laundry program."
      feature="campus_living.laundry.settings"
      icon={Settings2}
      backHref="/campus-living/laundry"
      backLabel="Back to Laundry"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Campus Living', href: '/campus-living' },
        { label: 'Laundry', href: '/campus-living/laundry' },
        { label: 'Settings' },
      ]}
      bullets={[
        'Define service types (wash, iron, dry-clean) with pricing',
        'Set turnaround SLAs per service',
        'Manage vendor contracts and contacts',
        'Control resident-facing booking windows',
      ]}
    />
  );
}
