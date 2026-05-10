'use client';

// /admin/internship-policy/attendance
// GPS geofence strict-block toggle, attendance marking window, LOP-immunity wiring status.

import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, Info } from 'lucide-react';
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
  INTERNSHIP_POLICY_KEYS.GPS_STRICT_MODE,
  INTERNSHIP_POLICY_KEYS.ATTENDANCE_FLAG_BELOW_PCT,
];

const FIELD_CONFIGS = [
  {
    key: INTERNSHIP_POLICY_KEYS.GPS_STRICT_MODE,
    label: 'GPS Geofence Strict Block',
    description:
      'When enabled, learners outside the hospital geofence cannot mark attendance (submission is rejected with a clear error). When disabled, out-of-geofence submissions are flagged but not blocked. Spec locked: must stay enabled for data quality. Only disable temporarily with Director approval.',
    type: 'boolean' as const,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.ATTENDANCE_FLAG_BELOW_PCT,
    label: 'Attendance Auto-Flag Threshold',
    description:
      'Learners whose attendance falls below this percentage are automatically flagged for coordinator review. INC nursing standard is 90%; AICTE engineering is 75%. Default: 75%. Cascade-preview shows how many currently-active learners enter warning state.',
    type: 'number' as const,
    unit: '%',
    min: 50,
    max: 100,
    step: 5,
  },
];

export default function AttendancePolicyPage() {
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
      <ContentLayout title="Attendance Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Attendance Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Attendance policy configuration is restricted to super-admin.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Attendance Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies', href: '/admin/internship-policy' },
          { label: 'Attendance' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Attendance Policies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Controls GPS geofence enforcement and attendance flag thresholds across all colleges.
            Strict GPS block is the adoption-metric data quality control — spec locked on.
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

      {/* LOP-immunity status callout */}
      <Alert className="mb-6 border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900">LOP-immunity wiring</AlertTitle>
        <AlertDescription className="text-blue-800 text-sm">
          Learners on active posting assignments are granted LOP-immunity in the faculty attendance
          service, resolving the production bug from specs/hrapp-issues-capture.md line 2853.
          This is wired via Agent A&apos;s migration (add{' '}
          <code className="rounded bg-blue-100 px-1">on_clinical_posting</code> row to{' '}
          <code className="rounded bg-blue-100 px-1">hr_attendance_status_types</code>).{' '}
          <Badge variant="secondary" className="text-xs ml-1">Phase 1A</Badge>
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
