'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useCommissionPaymentRequest } from '@/hooks/admission/use-commission-payments';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { RequestTimeline } from './request-timeline';
import { StageActionPanel } from './stage-action-panel';
import { DisburseForm } from './disburse-form';
import {
  COMMISSION_PAYMENT_MODES,
  type CommissionPaymentRequest
} from '@/types/consultant-commission-payment';

interface Props {
  id: string;
}

const formatAmount = (n: number | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

const formatPercent = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';

function getStatusBadge(status: CommissionPaymentRequest['status']) {
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
  // assignee_users.)
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { data: request, isLoading, isError, error } = useCommissionPaymentRequest(id);

  const [roleIds, setRoleIds] = useState<string[]>([]);

  const myUserId = profile?.id;

  // One fetch of my role ids for assignee matching (mirrors RPC gating below).
  useEffect(() => {
    if (!myUserId) return;
    createClientSupabaseClient().from('user_roles').select('role_id').eq('user_id', myUserId)
      .then(({ data }) => setRoleIds((data ?? []).map((r: any) => String(r.role_id))));
  }, [myUserId]);

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
    return <p className='text-muted-foreground py-8 text-center'>Commission payment request not found.</p>;
  }

  // Mirrors the RPC gating so the UI never offers an action the RPC would
  // reject: current-stage assignee (pinned user OR role holder) or super admin.
  const stage = request.status === 'pending_review'
    ? request.flow_snapshot.stages[request.current_stage_index] : null;
  const matches = (a?: { assignee_roles: string[]; assignee_users: string[] }) =>
    !!a && !!myUserId && (a.assignee_users.includes(myUserId) || a.assignee_roles.some((r) => roleIds.includes(r)));
  const canActOnStage = isSuperAdmin || matches(stage ?? undefined);

  // Separation of duties, as fn_act_on / fn_disburse_commission_payment_request
  // enforce it: nobody approves their own request or approves it twice, and
  // nobody who initiated or approved it pays it.
  const iInitiated = !!myUserId && request.initiated_by === myUserId;
  const iApproved = !!myUserId && (request.actions ?? []).some(
    (a) => a.action_type === 'approved' && a.actor_id === myUserId
  );
  const approveBlockedReason = iInitiated
    ? 'You initiated this request, so someone else must approve it.'
    : iApproved
      ? 'You approved an earlier stage, so someone else must approve this one.'
      : null;

  const atDisbursement = request.status === 'pending_disbursement';
  // Paying is super-admin only (same rule as recording a payment directly).
  const canDisburse = atDisbursement && isSuperAdmin && !iInitiated && !iApproved;
  // A request whose balance changed after final approval must be declinable here.
  const canDeclineAtDisbursement = atDisbursement && (isSuperAdmin || matches(request.flow_snapshot.disburser));

  const declineAction = request.actions?.find((a) => a.action_type === 'declined');
  const disburseAction = request.actions?.find((a) => a.action_type === 'disbursed');

  const consultant = request.consultant;
  const consultantName = consultant?.name ?? '';
  const bankDetailsMissing = !consultant?.bank_account_number?.trim() || !consultant?.bank_ifsc?.trim();
  const admissionYear = `${request.academic_year}-${request.academic_year + 1}`;
  const paymentModeLabel = COMMISSION_PAYMENT_MODES.find((m) => m.value === request.payment_mode)?.label
    ?? request.payment_mode ?? '—';

  const lines = request.lines ?? [];
  const lineTotals = lines.reduce(
    (t, l) => ({
      earned: t.earned + Number(l.earned_snapshot ?? 0),
      paid: t.paid + Number(l.paid_snapshot ?? 0),
      balance: t.balance + Number(l.balance_snapshot ?? 0)
    }),
    { earned: 0, paid: 0, balance: 0 }
  );

  const feeRows = request.fee_collection_snapshot ?? [];
  const feeTotals = feeRows.reduce(
    (t, r) => ({
      learners: t.learners + Number(r.learner_count ?? 0),
      fee: t.fee + Number(r.fee_amount ?? 0),
      paid: t.paid + Number(r.paid_amount ?? 0),
      balance: t.balance + Number(r.balance_amount ?? 0)
    }),
    { learners: 0, fee: 0, paid: 0, balance: 0 }
  );

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-2xl font-bold'>{request.request_number}</h1>
          {getStatusBadge(request.status)}
        </div>
        <p className='text-sm text-muted-foreground'>
          Commission payment · Admission year {admissionYear}
        </p>
        <p className='text-sm text-muted-foreground'>
          Total: {formatAmount(request.total_amount)}
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2 space-y-6'>
          {/* Institution lines */}
          <Card>
            <CardHeader>
              <CardTitle>Institution lines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead className='text-right'>Earned</TableHead>
                      <TableHead className='text-right'>Paid (at request)</TableHead>
                      <TableHead className='text-right'>Balance (at request)</TableHead>
                      <TableHead className='text-right'>Amount to pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.group?.name ?? '—'}</TableCell>
                        <TableCell className='text-right'>{formatAmount(l.earned_snapshot)}</TableCell>
                        <TableCell className='text-right'>{formatAmount(l.paid_snapshot)}</TableCell>
                        <TableCell className='text-right'>{formatAmount(l.balance_snapshot)}</TableCell>
                        <TableCell className='text-right font-medium'>{formatAmount(l.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total</TableCell>
                      <TableCell className='text-right'>{formatAmount(lineTotals.earned)}</TableCell>
                      <TableCell className='text-right'>{formatAmount(lineTotals.paid)}</TableCell>
                      <TableCell className='text-right'>{formatAmount(lineTotals.balance)}</TableCell>
                      <TableCell className='text-right'>{formatAmount(request.total_amount)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 1st-year fee collection snapshot — context for approvers */}
          <Card>
            <CardHeader>
              <CardTitle>1st Year Fee Collection (at initiation)</CardTitle>
              <CardDescription>
                Fee collection of this consultant&apos;s counted learners, frozen when the request was initiated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {feeRows.length === 0 ? (
                <p className='text-sm text-muted-foreground py-4 text-center'>No counted learners at initiation.</p>
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Institution</TableHead>
                        <TableHead className='text-right'>Learners</TableHead>
                        <TableHead className='text-right'>1st Year Fees</TableHead>
                        <TableHead className='text-right'>Paid</TableHead>
                        <TableHead className='text-right'>Paid %</TableHead>
                        <TableHead className='text-right'>Balance</TableHead>
                        <TableHead className='text-right'>Balance %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeRows.map((r) => (
                        <TableRow key={r.institution_id}>
                          <TableCell>{r.institution_name ?? '—'}</TableCell>
                          <TableCell className='text-right'>{Number(r.learner_count ?? 0)}</TableCell>
                          <TableCell className='text-right'>{formatAmount(r.fee_amount)}</TableCell>
                          <TableCell className='text-right'>{formatAmount(r.paid_amount)}</TableCell>
                          <TableCell className='text-right'>{formatPercent(Number(r.paid_amount ?? 0), Number(r.fee_amount ?? 0))}</TableCell>
                          <TableCell className='text-right'>{formatAmount(r.balance_amount)}</TableCell>
                          <TableCell className='text-right'>{formatPercent(Number(r.balance_amount ?? 0), Number(r.fee_amount ?? 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell className='text-right'>{feeTotals.learners}</TableCell>
                        <TableCell className='text-right'>{formatAmount(feeTotals.fee)}</TableCell>
                        <TableCell className='text-right'>{formatAmount(feeTotals.paid)}</TableCell>
                        <TableCell className='text-right'>{formatPercent(feeTotals.paid, feeTotals.fee)}</TableCell>
                        <TableCell className='text-right'>{formatAmount(feeTotals.balance)}</TableCell>
                        <TableCell className='text-right'>{formatPercent(feeTotals.balance, feeTotals.fee)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
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
                  <span className='text-muted-foreground'>Mode: </span>{paymentModeLabel}
                </p>
                {request.payment_details && Object.entries(request.payment_details).map(([k, v]) => (
                  <p key={k} className='text-sm'>
                    <span className='text-muted-foreground capitalize'>{k.replace(/_/g, ' ')}: </span>{String(v)}
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
              consultantName={consultantName}
              stageName={stage.name}
              approveBlockedReason={approveBlockedReason}
            />
          )}

          {atDisbursement && !isSuperAdmin && (
            <p className='text-sm text-muted-foreground'>
              Approved. Paying it is done by a super admin who did not initiate or approve it.
            </p>
          )}

          {atDisbursement && isSuperAdmin && (iInitiated || iApproved) && (
            <p className='text-sm text-muted-foreground'>
              You initiated or approved this request, so another super admin must pay it.
            </p>
          )}

          {canDeclineAtDisbursement && (
            <StageActionPanel
              requestId={request.id}
              requestNumber={request.request_number}
              consultantName={consultantName}
              stageName='Disbursement'
              declineOnly
            />
          )}

          {canDisburse && (
            <DisburseForm
              requestId={request.id}
              requestNumber={request.request_number}
              consultantName={consultantName}
              defaultBankName={consultant?.bank_name}
              defaultAccountNumber={consultant?.bank_account_number}
            />
          )}
        </div>

        <div className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Consultant</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              <p className='font-semibold'>{consultant?.name ?? '—'}</p>
              <p className='text-sm text-muted-foreground'>Code: {consultant?.code || '—'}</p>
              <p className='text-sm text-muted-foreground'>Bank: {consultant?.bank_name || '—'}</p>
              <p className='text-sm text-muted-foreground'>Account No: {consultant?.bank_account_number || '—'}</p>
              <p className='text-sm text-muted-foreground'>IFSC: {consultant?.bank_ifsc || '—'}</p>
              <p className='text-sm text-muted-foreground'>PAN: {consultant?.pan_number || '—'}</p>
              {bankDetailsMissing && (
                <div className='flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-md text-sm text-amber-700 dark:text-amber-300'>
                  <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
                  Bank details missing — update the consultant before disbursing
                </div>
              )}
              <Button variant='outline' size='sm' asChild className='w-full justify-start mt-2'>
                <Link href={`/admission/consultants/${request.consultant_id}?tab=commission-structure`}>
                  View Consultant
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
