'use client';

import { ClipboardCheck } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

export default function CampusLivingOnboardingPage() {
  return (
    <CampusLivingComingSoon
      title="Hosteller Onboarding"
      description="Structured first-week checklist for every new hosteller — ID verification, room inspection, mess registration, induction."
      feature="campus_living.onboarding"
      icon={ClipboardCheck}
      bullets={[
        'Auto-create checklist on allocation from the institution-default template',
        'Items: ID & police verification, room inspection, biometric enrolment, mess registration, induction briefing',
        'Parent/guardian sign-off capture with digital signature',
        'Completion SLA tracking per item and per hosteller',
        'Warden dashboard: overdue onboarding tasks per block',
        'Admin API live today at /api/api-management/campus-living/onboarding',
      ]}
    />
  );
}
