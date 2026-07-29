'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, Download } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useRefundRequest } from '@/hooks/billing/use-refund-workflow';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { generateRefundRequestPdf } from '@/lib/utils/billing/refund-request-pdf';
import { RequestTimeline } from './request-timeline';
import { StageActionPanel } from './stage-action-panel';
import { DisburseForm } from './disburse-form';
import type { RefundRequest } from '@/types/billing-refund-workflow';

interface Props {
  id: string;
}

function getTypeBadge(type: RefundRequest['refund_type']) {
  if (type === 'withdrawal') {
    return <Badge variant='outline' className='bg-orange-100 text-orange-800 border-orange-200'>Withdrawal</Badge>;
  }
  return <Badge variant='outline' className='bg-gray-100 text-gray-800 border-gray-200'>Adjustment</Badge>;
}

function getStatusBadge(status: RefundRequest['status']) {
  switch (status) {
    case 'disbursed':
      return <Badge variant='success'>Disbursed</Badge>;
    case 'declined':
      return <Badge variant='destructive'>Declined</Badge>;
    case 'pending_disbursement':
      return <Badge variant='outline' className='bg-blue-100 text-blue-800 border-blue-200'>Pending Disbursement</Badge>;
    case 'pending_review':
    default:
      return <Badge variant='outline' className='bg-yellow-100 text-yellow-800 border-yellow-200'>Pending Review</Badge>;
  }
}

export function RequestDetailClient({ id }: Props) {
  // useAuth() exposes ONLY { profile, isLoading, error } — `user`/`isSuperAdmin`
  // are NOT on it. Super-admin/permission verdicts come from usePermissions().
  // (profiles.id === auth.uid(), so profile.id is the id stored in stage
  // assignee_users; deriving myUserId from a non-existent useAuth().user left it
  // undefined and silently collapsed every gate to "no access".)
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { data: request, isLoading, isError, error } = useRefundRequest(id);

  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [institutionName, setInstitutionName] = useState('');

  const myUserId = profile?.id;

  // One fetch of my role ids for assignee matching (mirrors RPC gating below).
  useEffect(() => {
    if (!myUserId) return;
    createClientSupabaseClient().from('user_roles').select('role_id').eq('user_id', myUserId)
      .then(({ data }) => setRoleIds((data ?? []).map((r: any) => String(r.role_id))));
  }, [myUserId]);

  useEffect(() => {
    if (!request?.institution_id) return;
    createClientSupabaseClient().from('institutions').select('name').eq('id', request.institution_id).single()
      .then(({ data }) => setInstitutionName((data as any)?.name ?? ''));
  }, [request?.institution_id]);

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-[300px]'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (isError) {
    return <p className='text-destructive py-8 text-center'>{getErrorMessage(error)}</p>;
  }

  if (!request) {
    return <p className='text-muted-foreground py-8 text-center'>Refund request not found.</p>;
  }

  // Mirrors the RPC gating so the UI never offers an action the RPC would
  // reject: current-stage assignee (pinned user OR role holder) or super admin.
  const stage = request.status === 'pending_review'
    ? request.flow_snapshot.stages[request.current_stage_index] : null;
  const matches = (a?: { assignee_roles: string[]; assignee_users: string[] }) =>
    !!a && !!myUserId && (a.assignee_users.includes(myUserId) || a.assignee_roles.some((r) => roleIds.includes(r)));
  const canActOnStage = isSuperAdmin || matches(stage ?? undefined);
  const canDisburse = request.status === 'pending_disbursement' && (isSuperAdmin || matches(request.flow_snapshot.disburser));

  const declineAction = request.actions?.find((a) => a.action_type === 'declined');
  const disburseAction = request.actions?.find((a) => a.action_type === 'disbursed');

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-bold'>{request.request_number}</h1>
            {getStatusBadge(request.status)}
            {getTypeBadge(request.refund_type)}
          </div>
          <p className='text-sm text-muted-foreground'>
            Total refund: ₹{request.total_refund_amount.toLocaleString('en-IN')}
          </p>
        </div>
        <Button variant='outline' onClick={() => generateRefundRequestPdf(request)}>
          <Download className='h-4 w-4 mr-2' />
          Export PDF
        </Button>
      </div>

      {request.refund_type === 'withdrawal' && (
        <div className='flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 rounded-md text-sm text-orange-700 dark:text-orange-300'>
          <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
          Seat released — learner marked Withdrawal Pending; will be Exited on disbursement.
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2 space-y-6'>
          {/* Bills */}
          <Card>
            <CardHeader>
              <CardTitle>Bills</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead className='text-right'>Paid</TableHead>
                    <TableHead className='text-right'>Refund Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(request.bills ?? []).map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.bill?.bill_description ?? 'Bill'}</TableCell>
                      <TableCell className='text-right'>₹{Number(b.paid_amount_snapshot).toLocaleString('en-IN')}</TableCell>
                      <TableCell className='text-right'>₹{Number(b.refund_amount).toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className='text-right'>₹{request.total_refund_amount.toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestTimeline
                actions={request.actions ?? []}
                flowSnapshot={request.flow_snapshot}
                currentStageIndex={request.current_stage_index}
                status={request.status}
              />
            </CardContent>
          </Card>

          {request.status === 'declined' && (
            <Card>
              <CardHeader>
                <CardTitle className='text-destructive'>Declined</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <p className='text-sm'>
                  <span className='text-muted-foreground'>Stage: </span>{request.declined_stage_name}
                </p>
                {declineAction?.actor?.full_name && (
                  <p className='text-sm'>
                    <span className='text-muted-foreground'>By: </span>{declineAction.actor.full_name}
                  </p>
                )}
                <p className='text-sm'>
                  <span className='text-muted-foreground'>Reason: </span>{request.decline_reason}
                </p>
              </CardContent>
            </Card>
          )}

          {request.status === 'disbursed' && (
            <Card>
              <CardHeader>
                <CardTitle>Disbursement</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <p className='text-sm'>
                  <span className='text-muted-foreground'>Mode: </span>{request.payment_mode}
                </p>
                {request.payment_details && Object.entries(request.payment_details).map(([k, v]) => (
                  <p key={k} className='text-sm'>
                    <span className='text-muted-foreground'>{k.replace(/_/g, ' ')}: </span>{String(v)}
                  </p>
                ))}
                {disburseAction?.actor?.full_name && (
                  <p className='text-sm'>
                    <span className='text-muted-foreground'>By: </span>{disburseAction.actor.full_name}
                  </p>
                )}
                {request.disbursed_at && (
                  <p className='text-sm'>
                    <span className='text-muted-foreground'>At: </span>{format(new Date(request.disbursed_at), 'PPp')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {stage && canActOnStage && (
            <StageActionPanel
              requestId={request.id}
              requestNumber={request.request_number}
              institutionName={institutionName}
              stageName={stage.name}
            />
          )}

          {canDisburse && (
            <DisburseForm
              requestId={request.id}
              requestNumber={request.request_number}
              institutionName={institutionName}
            />
          )}
        </div>

        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Learner</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <p className='font-semibold'>
                {request.student ? `${request.student.first_name} ${request.student.last_name}`.trim() : '—'}
              </p>
              <p className='text-sm text-muted-foreground'>Roll No: {request.student?.roll_number ?? '—'}</p>
              <p className='text-sm text-muted-foreground'>Status: {request.student?.lifecycle_status ?? '—'}</p>
              <Button variant='outline' size='sm' asChild className='w-full justify-start mt-2'>
                <Link href={`/billing/schedule/students/${request.student_id}`}>View Learner Profile</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
