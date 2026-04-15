'use client';

import { FileSignature } from 'lucide-react';
import { CampusLivingComingSoon } from '../../_components/coming-soon';

export default function CampusLivingAMCContractsPage() {
  return (
    <CampusLivingComingSoon
      title="AMC Contracts"
      description="Annual Maintenance Contracts register — vendors, assets covered, renewal reminders, and SLA tracking."
      feature="campus_living.amc_contracts"
      icon={FileSignature}
      bullets={[
        'Register AMCs per vendor with covered assets and SLA terms',
        'Auto-reminders 60 / 30 / 7 days before expiry',
        'Link AMC to maintenance tickets for billing reconciliation',
        'Attach contract PDFs and amendment letters',
        'Exportable vendor performance scorecards (SLA met, escalations, cost)',
      ]}
    />
  );
}
