'use client';

// /admin/internship-policy/notifications
// Platform-wide notification cadence defaults + incident escalation timers.
// Per-college notification overrides from internship_college_notification_overrides are Q3.

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
  INTERNSHIP_POLICY_KEYS.NOTIFY_ROSTER_REMINDER_D_MINUS,
  INTERNSHIP_POLICY_KEYS.NOTIFY_FACULTY_SCHEDULE_D_MINUS,
  INTERNSHIP_POLICY_KEYS.NOTIFY_LOGBOOK_REMINDER_AFTER_HOURS,
  INTERNSHIP_POLICY_KEYS.NOTIFY_EVALUATION_REMINDER_AFTER_HOURS,
  INTERNSHIP_POLICY_KEYS.INCIDENT_MINOR_NOTIFY_WITHIN_HOURS,
  INTERNSHIP_POLICY_KEYS.INCIDENT_MAJOR_NOTIFY_WITHIN_HOURS,
  INTERNSHIP_POLICY_KEYS.INCIDENT_CRITICAL_NOTIFY_WITHIN_HOURS,
];

const FIELD_CONFIGS = [
  {
    key: INTERNSHIP_POLICY_KEYS.NOTIFY_ROSTER_REMINDER_D_MINUS,
    label: 'Roster Reminder (days before cycle)',
    description: 'Days before a cycle starts to send a roster confirmation reminder to HoDs and coordinators.',
    type: 'number' as const,
    unit: 'days',
    min: 1,
    max: 14,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.NOTIFY_FACULTY_SCHEDULE_D_MINUS,
    label: 'Faculty Schedule Notification (days before cycle)',
    description: 'Days before cycle start to notify assigned faculty supervisors of their posting schedule.',
    type: 'number' as const,
    unit: 'days',
    min: 1,
    max: 14,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.NOTIFY_LOGBOOK_REMINDER_AFTER_HOURS,
    label: 'Logbook Reminder (hours after posting day)',
    description: 'If a learner has not submitted a logbook entry by this many hours after a posting day, send a reminder notification. Default: 18 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 23,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.NOTIFY_EVALUATION_REMINDER_AFTER_HOURS,
    label: 'Evaluation Reminder (hours after due)',
    description: 'If a scheduled evaluation is not submitted within this window, send a reminder to the evaluator. Default: 48 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 168,
    step: 12,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.INCIDENT_MINOR_NOTIFY_WITHIN_HOURS,
    label: 'Minor Incident — Notify Within',
    description: 'Time window to notify the college coordinator after a minor incident is reported. Default: 24 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 72,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.INCIDENT_MAJOR_NOTIFY_WITHIN_HOURS,
    label: 'Major Incident — Notify Within',
    description: 'Time window to notify the HoD and college admin after a major incident. Default: 4 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 24,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.INCIDENT_CRITICAL_NOTIFY_WITHIN_HOURS,
    label: 'Critical Incident — Notify Within',
    description: 'Time window to notify the Director/COO and external contacts after a critical incident (student injury, emergency). Default: 1 hour.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 4,
    step: 1,
  },
];

export default function NotificationsPolicyPage() {
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
      <ContentLayout title="Notification Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Notification Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Notification policy configuration is restricted to super-admin.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Notification Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies', href: '/admin/internship-policy' },
          { label: 'Notifications' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notification Policies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Platform-wide notification cadences and incident escalation timers.
            Per-college overrides via <code className="rounded bg-muted px-1 text-xs">internship_college_notification_overrides</code> are
            a Q3 feature.
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

      <Alert className="mb-6 border-blue-100 bg-blue-50/50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900">Per-college overrides</AlertTitle>
        <AlertDescription className="text-blue-800 text-sm">
          These are platform-wide defaults. Individual colleges can override via{' '}
          <code className="rounded bg-blue-100 px-1">internship_college_notification_overrides</code>{' '}
          table. Override management UI landing{' '}
          <Badge variant="outline" className="text-xs">Q3</Badge>
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Reminder section */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1">
                Reminders
              </h2>
              {FIELD_CONFIGS.slice(0, 4).map((config) => (
                <PolicyField
                  key={config.key}
                  config={config}
                  currentValue={rows[config.key]?.value}
                  updatedAt={rows[config.key]?.updated_at}
                  onSaved={load}
                />
              ))}
            </div>

            {/* Incident escalation section */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1">
                Incident Escalation
              </h2>
              {FIELD_CONFIGS.slice(4).map((config) => (
                <PolicyField
                  key={config.key}
                  config={config}
                  currentValue={rows[config.key]?.value}
                  updatedAt={rows[config.key]?.updated_at}
                  onSaved={load}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </ContentLayout>
  );
}
