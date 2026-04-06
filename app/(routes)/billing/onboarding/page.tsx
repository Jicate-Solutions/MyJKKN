'use client';

import { OnboardingDataTable } from './_components/onboarding-data-table';

export default function BillingOnboardingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Learner Onboarding</h1>
        <p className="text-muted-foreground">
          Review and approve learners pending payment before enrollment
        </p>
      </div>
      <OnboardingDataTable />
    </div>
  );
}
