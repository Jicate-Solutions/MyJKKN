'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useApplicationsByStatus, useDecideApplication } from '@/hooks/hr/use-leave';
import { LEAVE_DURATION_LABELS } from '@/types/hr';

export default function ApprovalInboxPage() {
  const [hrOrgId, setHrOrgId] = useState('');
  const { data, isLoading } = useApplicationsByStatus(hrOrgId || undefined, ['pending', 'escalated']);
  const decide = useDecideApplication();

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pending = data?.data ?? [];

  const onApprove = (id: string) =>
    decide.mutate({ applicationId: id, decision: 'approve' });

  const onReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    await decide.mutateAsync({ applicationId: id, decision: 'reject', rejection_reason: rejectReason });
    setRejectId(null);
    setRejectReason('');
  };

  return (
    <ContentLayout title="Approval Inbox">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Approve</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Applications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-md">
              <Label htmlFor="hrOrgId">HR Organization ID</Label>
              <Input id="hrOrgId" value={hrOrgId} onChange={(e) => setHrOrgId(e.target.value)} placeholder="uuid" />
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && pending.length === 0 && hrOrgId && (
              <p className="text-sm text-muted-foreground">Inbox clear — no pending applications.</p>
            )}

            {pending.length > 0 && (
              <div className="space-y-3">
                {pending.map((app) => (
                  <div key={app.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {app.start_date} → {app.end_date}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {LEAVE_DURATION_LABELS[app.duration_type]} · {app.total_days} day(s)
                          </span>
                          {app.is_emergency && (
                            <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-300 text-xs">
                              Emergency
                            </Badge>
                          )}
                          {app.status === 'escalated' && (
                            <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 text-xs">
                              Escalated
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm mt-1">{app.reason}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Employee: <span className="font-mono">{app.employee_id}</span> · Applied: {new Date(app.created_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Chain step {app.current_step + 1}/{app.approval_chain.length} · Next approver role: {app.approval_chain[app.current_step]?.approver_role ?? '(final)'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 min-w-32">
                        <Button
                          size="sm"
                          onClick={() => onApprove(app.id)}
                          disabled={decide.isPending}
                          className="w-full"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectId(rejectId === app.id ? null : app.id)}
                          className="w-full"
                        >
                          {rejectId === app.id ? 'Cancel' : 'Reject'}
                        </Button>
                        <Link
                          href={`/hr/leave/${app.id}`}
                          className="text-xs text-primary hover:underline text-center"
                        >
                          Detail + comments
                        </Link>
                      </div>
                    </div>

                    {rejectId === app.id && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label htmlFor={`reason-${app.id}`}>Rejection Reason</Label>
                        <Textarea
                          id={`reason-${app.id}`}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          placeholder="Explain why you're rejecting"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onReject(app.id)}
                          disabled={!rejectReason.trim() || decide.isPending}
                        >
                          Confirm Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {decide.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{(decide.error as Error).message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
