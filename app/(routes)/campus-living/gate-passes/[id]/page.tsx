'use client';

import { use } from 'react';
import Link from 'next/link';
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
  Calendar,
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
  Bell
} from 'lucide-react';


const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; color: string }> = {
  issued: { label: 'Issued', variant: 'outline', color: 'text-gray-600' },
  active: { label: 'Active - Out', variant: 'default', color: 'text-blue-600' },
  returned: { label: 'Returned', variant: 'success', color: 'text-green-600' },
  overdue: { label: 'Overdue', variant: 'destructive', color: 'text-red-600' },
  cancelled: { label: 'Cancelled', variant: 'secondary', color: 'text-gray-600' },
};

const passTypeLabels: Record<string, string> = {
  regular_out: 'Regular Out',
  overnight: 'Overnight',
  emergency: 'Emergency',
  visitor_accompanied: 'Visitor Accompanied',
};

const timelineIcons: Record<string, React.ReactNode> = {
  issued: <QrCode className="h-4 w-4 text-purple-600" />,
  approved: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  exit: <DoorOpen className="h-4 w-4 text-blue-600" />,
  entry: <LogIn className="h-4 w-4 text-green-600" />,
  notified: <Bell className="h-4 w-4 text-amber-600" />,
  overdue: <AlertTriangle className="h-4 w-4 text-red-600" />,
};

export default function GatePassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: passData, isLoading } = useGatePass(id);
  const pass = passData as any;

  if (isLoading || !pass) {
    return (
      <ContentLayout title="Gate Pass Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const sCfg = statusConfig[pass.status] ?? { label: pass.status, variant: 'outline' as const, color: '' };

  // Calculate time remaining / overdue
  const now = new Date();
  const expectedReturn = new Date(pass.expected_return.replace(' ', 'T'));
  const isOverdue = !pass.actual_return && now > expectedReturn;
  const timeDiff = Math.abs(expectedReturn.getTime() - now.getTime());
  const hoursRemaining = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <ContentLayout title="Gate Pass Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes', href: '/campus-living/gate-passes' },
          { label: pass.pass_number },
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
                <h1 className="text-2xl font-bold">{pass.pass_number}</h1>
                <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                <Badge variant="outline">{passTypeLabels[pass.pass_type]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {pass.student.name} &middot; {pass.student.roll_number}
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
        {isOverdue && !pass.actual_return && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                Overdue by {hoursRemaining}h {minutesRemaining}m
              </p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Student was expected back at {pass.expected_return}. Parent has been notified.
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
                    <p className="font-medium mt-1">{pass.out_time}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Expected Return
                    </p>
                    <p className="font-medium mt-1">{pass.expected_return}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <LogIn className="h-3 w-3" /> Actual Return
                    </p>
                    <p className={`font-medium mt-1 ${isOverdue && !pass.actual_return ? 'text-red-600' : ''}`}>
                      {pass.actual_return ?? (isOverdue ? 'OVERDUE' : 'Pending')}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Destination
                    </p>
                    <p className="font-medium mt-1">{pass.destination}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="text-sm">
                    <p className="text-muted-foreground">Approved By</p>
                    <p className="font-medium">{pass.approved_by}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Security (Exit)</p>
                    <p className="font-medium">{pass.gate_security_out ?? 'Not recorded'}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Security (Entry)</p>
                    <p className="font-medium">{pass.gate_security_in ?? 'Not returned yet'}</p>
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
                  {pass.timeline.map((event, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          {timelineIcons[event.icon] ?? <Clock className="h-4 w-4" />}
                        </div>
                        {idx < pass.timeline.length - 1 && (
                          <div className="w-0.5 h-6 bg-muted" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{event.event}</p>
                          <p className="text-xs text-muted-foreground">{event.time}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">By: {event.by}</p>
                      </div>
                    </div>
                  ))}

                  {/* Pending return */}
                  {!pass.actual_return && (
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
                    <p className="text-xs font-mono mt-1">{pass.pass_number}</p>
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
                  <p className="font-medium">{pass.student.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Roll Number</p>
                  <p className="font-medium">{pass.student.roll_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="font-medium">{pass.student.department}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hostel</p>
                  <p className="font-medium">{pass.student.block}, Room {pass.student.room}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {pass.student.phone}
                  </p>
                </div>
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
                {!pass.actual_return && !isOverdue && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Time Remaining</p>
                    <p className="text-2xl font-bold text-blue-600">{hoursRemaining}h {minutesRemaining}m</p>
                  </div>
                )}
                {isOverdue && !pass.actual_return && (
                  <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Overdue By</p>
                    <p className="text-2xl font-bold text-red-600">{hoursRemaining}h {minutesRemaining}m</p>
                  </div>
                )}
                {pass.actual_return && (
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <p className="text-sm text-muted-foreground">Returned At</p>
                    <p className="text-lg font-bold text-green-600">{pass.actual_return}</p>
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
