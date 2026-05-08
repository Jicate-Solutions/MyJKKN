'use client';

// /admin/internship-policy/eligibility
// Fee compliance threshold, registration cutoff, GPA gate for posting allocation.

import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import {
  InternshipPolicyService,
  INTERNSHIP_POLICY_KEYS,
  type PolicyRow,
} from '@/lib/services/admin/internship-policy-service';
import { PolicyField } from '../_components/PolicyField';

const POLICY_KEYS = [
  INTERNSHIP_POLICY_KEYS.FEE_COMPLIANCE_THRESHOLD,
  INTERNSHIP_POLICY_KEYS.REGISTRATION_CUTOFF_DAYS,
];

const FIELD_CONFIGS = [
  {
    key: INTERNSHIP_POLICY_KEYS.FEE_COMPLIANCE_THRESHOLD,
    label: 'Fee Compliance Threshold',
    description:
      'Minimum percentage of fee paid before a learner is eligible for posting allocation. Learners below this threshold are blocked from being assigned to a cycle. Default: 70%.',
    type: 'number' as const,
    unit: '%',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.REGISTRATION_CUTOFF_DAYS,
    label: 'Registration Cutoff (days before cycle start)',
    description:
      'Number of days before a cycle starts after which new registrations are blocked. Coordinators cannot add learners after this window. Default: 7 days.',
    type: 'number' as const,
    unit: 'days',
    min: 0,
    max: 30,
    step: 1,
  },
];

export default function EligibilityPolicyPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const [rows, setRows] = useState<Record<string, PolicyRow>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await InternshipPolicyService.getMany(POLICY_KEYS);
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (permsLoading) {
    return (
      <ContentLayout title="Eligibility Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Eligibility Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Internship eligibility policy is restricted to super-admin users.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Eligibility Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies', href: '/admin/internship-policy' },
          { label: 'Eligibility' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Eligibility Policies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Controls who can be assigned to a posting cycle. Every save shows a cascade-preview
            of which in-flight learners are affected before the change is applied.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2 flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {FIELD_CONFIGS.map((config) => (
            <PolicyField
              key={config.key}
              config={config}
              currentValue={rows[config.key]?.value}
              updatedAt={rows[config.key]?.updated_at}
              onSaved={load}
            />
          ))}
        </div>
      )}
    </ContentLayout>
  );
}
