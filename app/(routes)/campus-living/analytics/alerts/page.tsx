'use client';

// Risk Alerts — LIVE-WIRED 2026-06-11 (was an honest PreviewBanner page with
// sample data; the promised hooks existed all along). Reads hostel_risk_alerts
// via useHostelRiskAlerts (super admins see all institutions — the hook
// handles scoping); Acknowledge / Resolve are real mutations.
// NOTE: nothing GENERATES risk alerts yet (no evaluation engine writes
// hostel_risk_alerts) — until that ships, this page truthfully shows the
// all-clear empty state. Rules are managed at ./alert-rules (live CRUD).

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bell, AlertTriangle, CheckCircle2, Clock, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useHostelRiskAlerts,
  useAcknowledgeRiskAlert,
  useResolveRiskAlert,
} from '@/hooks/campus-living/use-hostel-alerts';
import type { HostelRiskAlert, AlertSeverity, AlertStatus } from '@/types/campus-living';

const SEVERITY_BADGE: Record<AlertSeverity, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-800 hover:bg-red-100' },
  warning: { label: 'Warning', cls: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' },
  info: { label: 'Info', cls: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  dropout_risk: 'Dropout Risk',
  mental_health: 'Mental Health',
  fee_default: 'Fees',
  caterer_quality: 'Mess',
  attendance_drop: 'Attendance',
  meal_skip: 'Meal Skip',
};

function statusIcon(status: AlertStatus) {
  switch (status) {
    case 'active':
      return <AlertTriangle className="h-5 w-5 text-red-600" />;
    case 'acknowledged':
      return <Clock className="h-5 w-5 text-yellow-600" />;
    case 'resolved':
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    default:
      return <Bell className="h-5 w-5 text-muted-foreground" />;
  }
}

export default function AlertsPage() {
  const { profile } = useAuth();
  const institutionId = (profile?.institution_id as string | undefined) ?? undefined;

  // Hook scoping: super admins fetch ALL institutions; others their own.
  const { data: alertsResult, isLoading } = useHostelRiskAlerts(institutionId);
  const alerts: HostelRiskAlert[] = useMemo(
    () => alertsResult?.data ?? [],
    [alertsResult],
  );

  const acknowledge = useAcknowledgeRiskAlert();
  const resolve = useResolveRiskAlert();

  const [resolveTarget, setResolveTarget] = useState<HostelRiskAlert | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const counts = useMemo(() => {
    const by = (s: AlertStatus) => alerts.filter((a) => a.status === s).length;
    return { active: by('active'), acknowledged: by('acknowledged'), resolved: by('resolved') };
  }, [alerts]);

  return (
    <ContentLayout title="Risk Alerts">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Active Risk Alerts</h1>
            <p className="text-muted-foreground">
              Alerts raised against the rules configured for your hostels
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/campus-living/analytics/alert-rules">
              <Settings className="mr-2 h-4 w-4" />
              Configure Rules
            </Link>
          </Button>
        </div>

        {/* Status strip — counts from live rows */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-red-600">{counts.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Acknowledged</p>
              <p className="text-2xl font-bold text-yellow-600">{counts.acknowledged}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Resolved</p>
              <p className="text-2xl font-bold text-green-600">{counts.resolved}</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : alerts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <ShieldCheck className="h-8 w-8 text-green-600" />
              <p className="font-medium">No risk alerts — all clear</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Alerts appear here when a configured rule is triggered. Manage rules under
                Configure Rules.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {statusIcon(alert.status)}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{alert.title}</p>
                        <Badge className={SEVERITY_BADGE[alert.severity].cls}>
                          {SEVERITY_BADGE[alert.severity].label}
                        </Badge>
                        <Badge variant="outline">
                          {ALERT_TYPE_LABEL[alert.alert_type] ?? alert.alert_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Raised{' '}
                        {alert.created_at ? new Date(alert.created_at).toLocaleString('en-IN') : '—'}
                        {alert.status !== 'active' && ` · ${alert.status}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {alert.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acknowledge.isPending}
                        onClick={() =>
                          profile?.id &&
                          acknowledge.mutate({
                            id: alert.id,
                            payload: { acknowledged_by: profile.id as string },
                          })
                        }
                      >
                        Acknowledge
                      </Button>
                    )}
                    {(alert.status === 'active' || alert.status === 'acknowledged') && (
                      <Button
                        size="sm"
                        disabled={resolve.isPending}
                        onClick={() => {
                          setResolutionNotes('');
                          setResolveTarget(alert);
                        }}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Resolve dialog — captures resolution notes (required by the mutation) */}
        <Dialog open={!!resolveTarget} onOpenChange={(open) => !open && setResolveTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve alert</DialogTitle>
              <DialogDescription>{resolveTarget?.title}</DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="What was done about it? (resolution notes)"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={resolve.isPending || resolutionNotes.trim().length === 0}
                onClick={() => {
                  if (!resolveTarget || !profile?.id) return;
                  resolve.mutate(
                    {
                      id: resolveTarget.id,
                      payload: {
                        resolved_by: profile.id as string,
                        resolution_notes: resolutionNotes.trim(),
                      },
                    },
                    { onSuccess: () => setResolveTarget(null) },
                  );
                }}
              >
                Mark Resolved
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
