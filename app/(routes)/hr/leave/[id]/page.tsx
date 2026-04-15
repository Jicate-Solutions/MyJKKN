'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  useApplication,
  useApplicationComments,
  useAddComment,
  useWithdrawApplication,
  useCancelApplication,
} from '@/hooks/hr/use-leave';
import { LEAVE_DURATION_LABELS, LEAVE_STATUS_LABELS } from '@/types/hr';

export default function ApplicationDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const { data: app, isLoading } = useApplication(id);
  const { data: comments } = useApplicationComments(id);
  const addComment = useAddComment();
  const withdraw = useWithdrawApplication();
  const cancel = useCancelApplication();

  const [body, setBody] = useState('');

  if (isLoading) return <ContentLayout title="Loading…" />;
  if (!app) return <ContentLayout title="Not found" />;

  const onPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    await addComment.mutateAsync({ applicationId: id, body: body.trim() });
    setBody('');
  };

  return (
    <ContentLayout title="Leave Application">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/leave">Leave</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{app.start_date} → {app.end_date}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-3xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Application Details</CardTitle>
              <Badge>{LEAVE_STATUS_LABELS[app.status]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">Dates:</span> <span className="font-medium">{app.start_date} → {app.end_date}</span></div>
              <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{LEAVE_DURATION_LABELS[app.duration_type]}</span></div>
              <div><span className="text-muted-foreground">Total days:</span> <span className="font-medium">{app.total_days}</span></div>
              <div><span className="text-muted-foreground">Emergency:</span> <span className="font-medium">{app.is_emergency ? 'Yes' : 'No'}</span></div>
              <div><span className="text-muted-foreground">Employee:</span> <span className="font-mono text-xs">{app.employee_id}</span></div>
              <div><span className="text-muted-foreground">Applied by:</span> <span className="font-mono text-xs">{app.applied_by}</span></div>
              <div><span className="text-muted-foreground">Created:</span> {new Date(app.created_at).toLocaleString()}</div>
              {app.final_decided_at && (
                <div><span className="text-muted-foreground">Decided:</span> {new Date(app.final_decided_at).toLocaleString()}</div>
              )}
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Reason</div>
              <p className="whitespace-pre-wrap">{app.reason}</p>
            </div>
            {app.rejection_reason && (
              <div className="text-red-700 dark:text-red-400">
                <div className="mb-1">Rejection Reason</div>
                <p className="whitespace-pre-wrap">{app.rejection_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Approval Chain (frozen at apply-time)</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {app.approval_chain.map((step, idx) => (
                <li key={idx} className="flex items-center gap-3 text-sm">
                  <span className={`h-2 w-2 rounded-full ${
                    step.status === 'approved' ? 'bg-green-500' :
                    step.status === 'rejected' ? 'bg-red-500' :
                    idx === app.current_step ? 'bg-yellow-500' : 'bg-muted'
                  }`} />
                  <span className="font-medium">Step {step.step_order}:</span>
                  <span>{step.approver_role}</span>
                  <span className="text-xs text-muted-foreground">({step.status})</span>
                  {step.decided_at && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(step.decided_at).toLocaleString()}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Discussion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {comments && comments.length > 0 ? (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="border-l-2 border-muted pl-3 py-1">
                    <p className="text-sm">{c.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.author_id} · {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}

            <form onSubmit={onPost} className="space-y-2 pt-2 border-t">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder="Add a comment…"
              />
              <Button type="submit" size="sm" disabled={!body.trim() || addComment.isPending}>
                Post Comment
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          {app.status === 'pending' && (
            <Button variant="outline" onClick={() => withdraw.mutate(id)} disabled={withdraw.isPending}>
              Withdraw
            </Button>
          )}
          {app.status === 'approved' && !app.superseded_by && (
            <Button variant="outline" onClick={() => cancel.mutate(id)} disabled={cancel.isPending}>
              Cancel (restore balance)
            </Button>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
