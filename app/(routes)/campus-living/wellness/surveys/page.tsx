'use client';

import { ClipboardList } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

export default function CampusLivingWellnessSurveysPage() {
  return (
    <CampusLivingComingSoon
      title="Wellness Surveys"
      description="Configure pulse-survey templates, cadence, and auto-escalation rules for critical responses."
      feature="campus_living.wellness_surveys"
      icon={ClipboardList}
      bullets={[
        'Build surveys from pulse, PHQ-9, burnout, and custom question banks',
        'Schedule cadence per block (weekly, biweekly, monthly)',
        'Configure critical-response triggers and escalation recipients',
        'Preview surveys on mobile before publishing',
        'Track response rate and completion time per survey',
      ]}
    />
  );
}
