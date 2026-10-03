'use client';

import { AccessGate } from '@/components/instasolver/access-gate';
import { AnalyticsClient } from './_components/analytics-client';

export default function AnalyticsPage() {
  return (
    <AccessGate need="analytics">
      <AnalyticsClient />
    </AccessGate>
  );
}
