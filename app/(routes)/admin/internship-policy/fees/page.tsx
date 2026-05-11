'use client';

// /admin/internship-policy/fees
// Fee compliance threshold (primary) + logbook late penalty.
// This is the page from the spec's v1 differentiator example:
//   "Changing fee threshold from 70% → 80% will block ~12 currently-pending learners"

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
  INTERNSHIP_POLICY_KEYS.LOGBOOK_LATE_PENALTY_PCT,
];

const FIELD_CONFIGS = [
  {
    key: INTERNSHIP_POLICY_KEYS.FEE_COMPLIANCE_THRESHOLD,
    label: 'Fee Compliance Threshold',
    description:
      'Percentage of fee balance that must be cleared before a learner is eligible for posting allocation. Cascade-preview shows how many in-flight learners would be blocked by raising this. Default: 70%.',
    type: 'number' as const,
    unit: '%',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.LOGBOOK_LATE_PENALTY_PCT,
    label: 'Logbook Late Submission Penalty',
    description:
      'Score deduction applied when a logbook is submitted after the deadline window. Applied to the logbook evaluation score for the affected day. Default: 10%.',
    type: 'number' as const,
    unit: '%',
    min: 0,
    max: 50,
    step: 5,
  },
];

export default function FeesPolicyPage() {
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
      <ContentLayout title="Fees Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Fees Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Internship fee policy is restricted to super-admin users.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Fees Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies', href: '/admin/internship-policy' },
          { label: 'Fees' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fees Policies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Fee threshold drives posting eligibility for ~2,740 learners across 7 colleges.
            Raising the threshold will block learners who have partially cleared dues.
            The cascade-preview pane shows exactly who is affected before you save.
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
