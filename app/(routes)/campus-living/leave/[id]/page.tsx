'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useHostelLeaveRequest } from '@/hooks/campus-living/use-hostel-leave';
import {
  ArrowLeft,
  User,
  Calendar,
  MapPin,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ShieldCheck,
  Users,
  FileText
} from 'lucide-react';


const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  pending_parent: { label: 'Pending Parent Consent', variant: 'default' },
  pending_warden: { label: 'Pending Warden Approval', variant: 'default' },
  pending_chief: { label: 'Pending Chief Warden', variant: 'default' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

const leaveTypeLabels: Record<string, string> = {
  home_visit: 'Home Visit',
  weekend: 'Weekend',
  vacation: 'Vacation',
  emergency: 'Emergency',
  medical: 'Medical',
  academic: 'Academic',
  night_out: 'Night Out',
};

export default function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: leave, isLoading } = useHostelLeaveRequest(id);

  if (isLoading || !leave) {
    return (
      <ContentLayout title="Leave Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const sCfg = statusConfig[leave.status] ?? { label: leave.status, variant: 'outline' as const };

  return (
    <ContentLayout title="Leave Request Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Leave', href: '/campus-living/leave' },
          { label: `${leave.student.name}'s Request` },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/leave">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{leave.student.name}</h1>
                <Badge variant={sCfg.variant}>{sCfg.label}</Badge>
                <Badge variant="outline">{leaveTypeLabels[leave.leave_type] ?? leave.leave_type}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {leave.student.roll_number} &middot; {leave.student.department} &middot; {leave.student.block}, Room {leave.student.room}
              </p>
            </div>
          </div>

          {/* Warden Actions */}
          {leave.status === 'pending_warden' && (
            <div className="flex gap-2">
              <Button variant="destructive">
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Leave Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leave Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Leave Type</p>
                    <p className="font-medium mt-1">{leaveTypeLabels[leave.leave_type]}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-medium mt-1">{leave.from_date} to {leave.to_date}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p className="font-medium mt-1">{leave.reason}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Destination */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Destination
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{leave.destination}</p>
                </div>
                {leave.destination_address && (
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="font-medium">{leave.destination_address}</p>
                  </div>
                )}
                {leave.destination_contact && (
                  <div>
                    <p className="text-sm text-muted-foreground">Contact at Destination</p>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {leave.destination_contact}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Expected Return</p>
                  <p className="font-medium">
                    {leave.expected_return_time
                      ? new Date(leave.expected_return_time).toLocaleString('en-IN')
                      : `${leave.to_date}, evening`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Approval Workflow */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Approval Workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {leave.workflow_history.map((step, idx) => (
                    <div key={step.step} className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          step.status === 'completed' ? 'bg-green-100' :
                          step.status === 'pending' ? 'bg-amber-100' :
                          step.status === 'rejected' ? 'bg-red-100' :
                          'bg-muted'
                        }`}>
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : step.status === 'pending' ? (
                            <Clock className="h-5 w-5 text-amber-600" />
                          ) : step.status === 'rejected' ? (
                            <XCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <span className="text-xs font-medium">{idx + 1}</span>
                          )}
                        </div>
                        {idx < leave.workflow_history.length - 1 && (
                          <div className={`w-0.5 h-8 ${step.status === 'completed' ? 'bg-green-300' : 'bg-muted'}`} />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{step.label}</p>
                          {step.at && (
                            <p className="text-xs text-muted-foreground">{step.at}</p>
                          )}
                        </div>
                        {step.by && (
                          <p className="text-sm text-muted-foreground">By: {step.by}</p>
                        )}
                        {step.note && (
                          <p className="text-xs text-muted-foreground mt-1">{step.note}</p>
                        )}
                        {step.status === 'pending' && (
                          <Badge variant="default" className="mt-1">Awaiting Action</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Warden Remarks (if pending) */}
            {leave.status === 'pending_warden' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Warden Remarks</CardTitle>
                  <CardDescription>Add remarks before approving or rejecting</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Add your remarks (optional)..."
                    rows={3}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="destructive">
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
                  <p className="font-medium">{leave.student.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Roll Number</p>
                  <p className="font-medium">{leave.student.roll_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hostel</p>
                  <p className="font-medium">{leave.student.block}, Room {leave.student.room}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{leave.student.phone}</p>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{leave.emergency_contact.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{leave.emergency_contact.phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Relation</p>
                  <p className="font-medium capitalize">{leave.emergency_contact.relation}</p>
                </div>
              </CardContent>
            </Card>

            {/* Parent Consent Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Parent Consent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={leave.parent_consent_status === 'approved' ? 'success' : leave.parent_consent_status === 'rejected' ? 'destructive' : 'default'}>
                    {leave.parent_consent_status}
                  </Badge>
                </div>
                {leave.parent_consent_at && (
                  <p className="text-sm text-muted-foreground">
                    Consented at: {new Date(leave.parent_consent_at).toLocaleString('en-IN')}
                  </p>
                )}
                {leave.parent_consent_method && (
                  <p className="text-sm text-muted-foreground">
                    Method: {leave.parent_consent_method.toUpperCase()}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Submitted Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Request Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submitted</span>
                  <span>{new Date(leave.created_at).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={sCfg.variant} className="text-xs">{sCfg.label}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
