'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { format, isPast } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useGatePass } from '@/hooks/campus-living/use-gate-passes';
import {
  ArrowLeft,
  User,
  MapPin,
  Phone,
  QrCode,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Shield,
  DoorOpen,
  LogIn,
  Bell,
  Home,
  FileText,
} from 'lucide-react';


const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; color: string }> = {
  requested: { label: 'Requested', variant: 'outline', color: 'text-amber-600' },
  issued: { label: 'Issued', variant: 'outline', color: 'text-gray-600' },
  active: { label: 'Active - Out', variant: 'default', color: 'text-blue-600' },
  returned: { label: 'Returned', variant: 'success', color: 'text-green-600' },
  overdue: { label: 'Overdue', variant: 'destructive', color: 'text-red-600' },
  cancelled: { label: 'Cancelled', variant: 'secondary', color: 'text-gray-600' },
  rejected: { label: 'Rejected', variant: 'destructive', color: 'text-red-600' },
};

const passTypeLabels: Record<string, string> = {
  regular_out: 'Regular Out',
  overnight: 'Overnight',
  emergency: 'Emergency',
  visitor_accompanied: 'Visitor Accompanied',
};

// Helper to safely format a timestamp
function formatTimestamp(ts: string | null | undefined, pattern = 'MMM d, yyyy h:mm a'): string {
  if (!ts) return '—';
  try {
    return format(new Date(ts), pattern);
  } catch {
    return '—';
  }
}

// Build timeline from timestamp columns
interface TimelineEntry {
  icon: React.ReactNode;
  event: string;
  time: string;
  by?: string;
}

function buildTimeline(pass: any): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // 1. Pass created
  if (pass.created_at) {
    entries.push({
      icon: <FileText className="h-4 w-4 text-purple-600" />,
      event: 'Pass Created',
      time: formatTimestamp(pass.created_at),
    });
  }

  // 2. Approved
  if (pass.approver) {
    entries.push({
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      event: 'Approved',
      time: formatTimestamp(pass.updated_at),
      by: pass.approver.full_name ?? 'Staff',
    });
  }

  // 3. Rejected
  if (pass.rejected_by) {
    entries.push({
      icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
      event: 'Rejected',
      time: formatTimestamp(pass.updated_at),
      by: pass.rejection_reason ? `Reason: ${pass.rejection_reason}` : undefined,
    });
  }

  // 4. Out time (left hostel gate)
  if (pass.out_time) {
    entries.push({
      icon: <DoorOpen className="h-4 w-4 text-blue-600" />,
      event: 'Exited Gate',
      time: formatTimestamp(pass.out_time),
      by: pass.security_out?.full_name ?? undefined,
    });
  }

  // 5. Left campus
  if (pass.left_campus_at) {
    entries.push({
      icon: <DoorOpen className="h-4 w-4 text-indigo-600" />,
      event: 'Left Campus',
      time: formatTimestamp(pass.left_campus_at),
    });
  }

  // 6. Reached home (parent confirmed)
  if (pass.reached_home_at) {
    entries.push({
      icon: <Home className="h-4 w-4 text-green-600" />,
      event: 'Reached Home',
      time: formatTimestamp(pass.reached_home_at),
      by: 'Parent confirmed',
    });
  }

  // 7. Parent notified
  if (pass.parent_notified) {
    entries.push({
      icon: <Bell className="h-4 w-4 text-amber-600" />,
      event: 'Parent Notified',
      time: formatTimestamp(pass.updated_at),
    });
  }

  // 8. Left home (heading back)
  if (pass.left_home_at) {
    entries.push({
      icon: <LogIn className="h-4 w-4 text-blue-600" />,
      event: 'Left Home (heading back)',
      time: formatTimestamp(pass.left_home_at),
      by: 'Parent confirmed',
    });
  }

  // 9. Reached campus
  if (pass.reached_campus_at) {
    entries.push({
      icon: <Shield className="h-4 w-4 text-green-600" />,
      event: 'Reached Campus',
      time: formatTimestamp(pass.reached_campus_at),
    });
  }

  // 10. Returned (security scanned in)
  if (pass.actual_return) {
    entries.push({
      icon: <LogIn className="h-4 w-4 text-green-600" />,
      event: 'Returned to Hostel',
      time: formatTimestamp(pass.actual_return),
      by: pass.security_in?.full_name ?? undefined,
    });
  }

  // 11. Cancelled
  if (pass.cancelled_by) {
    entries.push({
      icon: <AlertTriangle className="h-4 w-4 text-gray-600" />,
      event: 'Cancelled',
      time: formatTimestamp(pass.updated_at),
      by: pass.cancellation_reason ? `Reason: ${pass.cancellation_reason}` : undefined,
    });
  }

  return entries;
}

export default function GatePassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: passData, isLoading, isError } = useGatePass(id);
  const pass = passData as any;

  const timeline = useMemo(() => (pass ? buildTimeline(pass) : []), [pass]);

  if (isLoading) {
    return (
      <ContentLayout title="Gate Pass Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !pass) {
    return (
      <ContentLayout title="Gate Pass Details">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Gate pass not found or could not be loaded.</p>
          <Button variant="outline" asChild>
            <Link href="/campus-living/gate-passes">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Gate Passes
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const sCfg = statusConfig[pass.status] ?? { label: pass.status, variant: 'outline' as const, color: '' };

  // Calculate time remaining / overdue
  const now = new Date();
  const expectedReturn = pass.expected_return ? new Date(pass.expected_return) : null;
  const isOverdue = !pass.actual_return && expectedReturn && isPast(expectedReturn);
  const timeDiff = expectedReturn ? Math.abs(expectedReturn.getTime() - now.getTime()) : 0;
  const hoursRemaining = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <ContentLayout title="Gate Pass Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes', href: '/campus-living/gate-passes' },
          { label: pass.pass_number || 'Details' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/gate-passes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{pass.pass_number || 'Pending'}</h1>
                <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                <Badge variant="outline">{passTypeLabels[pass.pass_type] ?? pass.pass_type}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {pass.learner?.full_name ?? 'Unknown Student'}
              </p>
            </div>
          </div>

          {pass.status === 'active' && (
            <Button>
              <LogIn className="mr-2 h-4 w-4" />
              Record Return
            </Button>
          )}
        </div>

        {/* Overdue Warning */}
        {isOverdue && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                Overdue by {hoursRemaining}h {minutesRemaining}m
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Student was expected back at {formatTimestamp(pass.expected_return)}.
                {pass.parent_notified ? ' Parent has been notified.' : ''}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Pass Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pass Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <DoorOpen className="h-3 w-3" /> Out Time
                    </p>
                    <p className="font-medium mt-1">{formatTimestamp(pass.out_time)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Expected Return
                    </p>
                    <p className="font-medium mt-1">{formatTimestamp(pass.expected_return)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <LogIn className="h-3 w-3" /> Actual Return
                    </p>
                    <p className={`font-medium mt-1 ${isOverdue ? 'text-red-600' : ''}`}>
                      {pass.actual_return ? formatTimestamp(pass.actual_return) : (isOverdue ? 'OVERDUE' : 'Pending')}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Destination
                    </p>
                    <p className="font-medium mt-1">{pass.destination || '—'}</p>
                  </div>
                </div>

                {/* Reason */}
                {pass.reason && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="font-medium mt-1">{pass.reason}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="text-sm">
                    <p className="text-muted-foreground">Approved By</p>
                    <p className="font-medium">{pass.approver?.full_name ?? '—'}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Security (Exit)</p>
                    <p className="font-medium">{pass.security_out?.full_name ?? 'Not recorded'}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Security (Entry)</p>
                    <p className="font-medium">{pass.security_in?.full_name ?? 'Not returned yet'}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Parent Notified</p>
                    <Badge variant={pass.parent_notified ? 'success' : 'outline'}>
                      {pass.parent_notified ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {timeline.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          {entry.icon}
                        </div>
                        {idx < timeline.length - 1 && (
                          <div className="w-0.5 h-6 bg-muted" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{entry.event}</p>
                          <p className="text-xs text-muted-foreground">{entry.time}</p>
                        </div>
                        {entry.by && (
                          <p className="text-sm text-muted-foreground">{entry.by}</p>
                        )}
                      </div>
                    </div>
                  ))}

                  {timeline.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet.</p>
                  )}

                  {/* Pending return */}
                  {!pass.actual_return && pass.status !== 'cancelled' && pass.status !== 'rejected' && (
                    <div className="flex items-start gap-4">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <LogIn className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm text-muted-foreground">Return Entry</p>
                        <p className="text-sm text-muted-foreground">Awaiting QR scan at gate</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* QR Code Display */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Gate Pass QR
                </CardTitle>
                <CardDescription>Show at security gate for scanning</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                  <div className="text-center">
                    <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">QR Code</p>
                    <p className="text-xs font-mono mt-1">{pass.pass_number || '—'}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Security will scan this code at exit and entry gates
                </p>
              </CardContent>
            </Card>

            {/* Student Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Student
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{pass.learner?.full_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{pass.learner?.email ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Block</p>
                  <p className="font-medium">{pass.block?.name ?? '—'}</p>
                </div>
                {pass.learner?.phone && (
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {pass.learner.phone}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Time Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Time Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!pass.actual_return && !isOverdue && expectedReturn && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Time Remaining</p>
                    <p className="text-2xl font-bold text-blue-600">{hoursRemaining}h {minutesRemaining}m</p>
                  </div>
                )}
                {isOverdue && (
                  <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Overdue By</p>
                    <p className="text-2xl font-bold text-red-600">{hoursRemaining}h {minutesRemaining}m</p>
                  </div>
                )}
                {pass.actual_return && (
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Returned At</p>
                    <p className="text-lg font-bold text-green-600">{formatTimestamp(pass.actual_return)}</p>
                  </div>
                )}
                {!expectedReturn && !pass.actual_return && (
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">No expected return set</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
