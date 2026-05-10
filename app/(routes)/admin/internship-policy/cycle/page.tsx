'use client';

// /admin/internship-policy/cycle
// Roster reminder lead-time, vehicle lead time — cycle-level platform defaults.
// Per-college blackout dates are a Q3 feature (internship_college_blackouts table).

import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import {
  InternshipPolicyService,
  INTERNSHIP_POLICY_KEYS,
  type PolicyRow,
} from '@/lib/services/admin/internship-policy-service';
import { PolicyField } from '../_components/PolicyField';

const POLICY_KEYS = [
  INTERNSHIP_POLICY_KEYS.ROSTER_REMINDER_D_MINUS,
  INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS,
];

const FIELD_CONFIGS = [
  {
    key: INTERNSHIP_POLICY_KEYS.ROSTER_REMINDER_D_MINUS,
    label: 'Roster Reminder Lead-time',
    description:
      'Number of days before a cycle starts when the system sends roster confirmation reminders to coordinators and HoDs. Default: 3 days before start.',
    type: 'number' as const,
    unit: 'days',
    min: 1,
    max: 14,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS,
    label: 'Vehicle Booking Lead-time',
    description:
      'Minimum number of days in advance a vehicle must be booked for hospital transport. Requests within this window are flagged as urgent and require coordinator override. Default: 5 days.',
    type: 'number' as const,
    unit: 'days',
    min: 1,
    max: 30,
    step: 1,
  },
];

export default function CyclePolicyPage() {
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
      <ContentLayout title="Cycle Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Cycle Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Cycle policy configuration is restricted to super-admin.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Cycle Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies', href: '/admin/internship-policy' },
          { label: 'Cycle' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cycle Policies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Platform-wide defaults for cycle timing and logistics. Per-college status labels
            and blackout calendars are configurable per college in Phase 1D.
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

      {/* Q3 features */}
      <Alert className="mb-6">
        <AlertTitle className="flex items-center gap-2">
          Per-college cycle config
          <Badge variant="outline" className="text-xs">Q3</Badge>
        </AlertTitle>
        <AlertDescription className="text-sm">
          Per-college blackout dates (<code className="rounded bg-muted px-1">internship_college_blackouts</code>),
          per-college status label overrides (<code className="rounded bg-muted px-1">internship_cycle_status_labels</code>),
          and per-program duration config will be surfaced here in Phase 1D.
        </AlertDescription>
      </Alert>

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
