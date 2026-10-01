'use client';

// Vacate request detail. Used by the learner (read-only + cancel), the warden
// and hostel office.
//
// Warden step: (1) the learner's hostel + mess bills, all years, must all be
// settled; (2) every required checklist item must be ticked; then Approve
// auto-vacates. Both gates are enforced again inside fn_cl_vacate_warden_approve
// — the disabled button here is a convenience, not the control.

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useVacateRequest,
  useVacateBillStatus,
  useCancelVacate,
  useRejectVacate,
  useApproveVacate,
  useSetChecklistItem,
  useSubmitVacateDraft,
} from '@/hooks/campus-living/use-hostel-vacate';
import { DocumentUploader } from '../_components/document-uploader';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  X,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { VACATE_REASON_LABELS } from '@/types/hostel-vacate';
import type { HostelClearanceItem, VacateBillStatus } from '@/types/hostel-vacate';

const formatInr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_parent: 'Parent consent',
  pending_warden: 'With warden',
  pending_chief: 'Chief warden',
  pending_dues: 'Dues clearance',
  approved: 'Approved',
  completed: 'Vacated',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function VacateRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  // usePermissions returns permissions as Record<string, boolean>; super admins
  // get an empty object and rely on isSuperAdmin, so every gate ORs against it.
  const { permissions, isSuperAdmin } = usePermissions();
  const canApprove = isSuperAdmin || !!permissions?.['campus_living.vacate_requests.approve_warden'];
  const canTick = isSuperAdmin || !!permissions?.['campus_living.vacate_requests.mark_clearance'];
  const canStaffCancel = isSuperAdmin || !!permissions?.['campus_living.vacate_requests.cancel'];

  const { data: request, isLoading } = useVacateRequest(id);
  const { data: bills, isLoading: billsLoading, error: billsError } = useVacateBillStatus(id, !!request);

  const cancelMut = useCancelVacate();
  const rejectMut = useRejectVacate();
  const approveMut = useApproveVacate();
  const submitMut = useSubmitVacateDraft();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');

  if (isLoading || !request) {
    return (
      <ContentLayout title='Vacate Request'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  const items = [...(request.clearance_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const isPending = request.status === 'pending_warden';
  const isDraft = request.status === 'draft';
  const isClosed = ['completed', 'rejected', 'cancelled'].includes(request.status);
  const isRequester = request.submitted_by_id === profile?.id || request.learner_id === profile?.id;

  const pendingRequired = items.filter((i) => i.is_required && !i.is_cleared).length;
  const billsClear = !!bills && bills.total_outstanding === 0;
  const canApproveNow = canApprove && isPending && billsClear && pendingRequired === 0;

  const blockers: string[] = [];
  if (isPending) {
    if (billsLoading) blockers.push('Checking bills…');
    else if (billsError || !bills) blockers.push('Bill status could not be loaded');
    else if (!billsClear)
      blockers.push(`${formatInr(bills.total_outstanding)} unpaid across ${bills.unpaid_count} bill(s)`);
    if (pendingRequired > 0) blockers.push(`${pendingRequired} required checklist item(s) not cleared`);
  }

  const canCancel =
    (isDraft || isPending) && (isRequester || (canStaffCancel && !isRequester) || canApprove);
  const learnerName = request.learner_profile?.full_name ?? 'Unknown';

  async function handleCancel() {
    if (!reason.trim()) return;
    await cancelMut.mutateAsync({ requestId: id, reason });
    setCancelOpen(false);
    setReason('');
  }

  async function handleReject() {
    if (!reason.trim()) return;
    await rejectMut.mutateAsync({ requestId: id, reason });
    setRejectOpen(false);
    setReason('');
  }

  async function handleApprove() {
    await approveMut.mutateAsync({ requestId: id, remarks: remarks || null });
    setApproveOpen(false);
    setRemarks('');
  }

  return (
    <ContentLayout title='Vacate Request'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Vacate Requests', href: '/campus-living/vacate-requests' },
          { label: 'Detail' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='ghost' size='icon'>
            <Link href='/campus-living/vacate-requests'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <div className='flex-1'>
            <div className='flex items-center gap-2'>
              <h1 className='text-2xl font-bold py-1'>Vacate Request</h1>
              <Badge variant={request.status === 'completed' ? 'success' : request.status === 'rejected' ? 'destructive' : 'secondary'}>
                {STATUS_LABEL[request.status] ?? request.status}
              </Badge>
            </div>
            <p className='text-sm text-muted-foreground'>
              {learnerName} · raised {new Date(request.created_at).toLocaleDateString()}
              {request.submitted_on_behalf_of_id ? ' (on behalf, by staff)' : ''}
            </p>
          </div>
          {canCancel && (
            <Button variant='outline' onClick={() => setCancelOpen(true)}>
              <X className='mr-2 h-4 w-4' />
              Cancel Request
            </Button>
          )}
        </div>

        {request.status === 'rejected' && request.rejected_reason && (
          <div className='p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm'>
            <span className='font-medium text-destructive'>Rejected:</span> {request.rejected_reason}
          </div>
        )}
        {request.status === 'cancelled' && request.cancelled_reason && (
          <div className='p-3 rounded-md border bg-muted text-sm'>
            <span className='font-medium'>Cancelled:</span> {request.cancelled_reason}
          </div>
        )}

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          <div className='lg:col-span-2 space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Request Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <Row label='Learner'>
                  <div className='flex flex-col'>
                    <span className='text-sm font-medium'>{learnerName}</span>
                    <span className='text-xs text-muted-foreground'>{request.learner_profile?.email ?? ''}</span>
                  </div>
                </Row>
                <Row label='Reason'>
                  <div className='flex items-center gap-2'>
                    <Badge variant='outline'>{VACATE_REASON_LABELS[request.reason_type] ?? request.reason_type}</Badge>
                    {request.has_medical_grounds && <Badge variant='destructive'>Medical</Badge>}
                  </div>
                </Row>
                <Row label='Requested date'>
                  <span>{request.requested_vacate_date}</span>
                </Row>
                <Row label='Description'>
                  <p className='text-sm whitespace-pre-wrap'>{request.reason_text}</p>
                </Row>
                {request.medical_notes && (
                  <Row label='Medical notes'>
                    <p className='text-sm whitespace-pre-wrap'>{request.medical_notes}</p>
                  </Row>
                )}
                {request.actual_vacate_date && (
                  <Row label='Vacated on'>
                    <span>{request.actual_vacate_date}</span>
                  </Row>
                )}
                {request.room_snapshot && (
                  <Row label='Room held'>
                    <span className='text-sm'>
                      {[
                        request.room_snapshot.block_name,
                        request.room_snapshot.room_number && `Room ${request.room_snapshot.room_number}`,
                        request.room_snapshot.bed_number && `Bed ${request.room_snapshot.bed_number}`,
                        request.room_snapshot.hostel_category_name,
                        request.room_snapshot.mess_category_name && `Mess: ${request.room_snapshot.mess_category_name}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Row>
                )}
              </CardContent>
            </Card>

            <BillsCard
              bills={isClosed && request.bills_snapshot ? request.bills_snapshot : bills}
              loading={billsLoading && !request.bills_snapshot}
              error={!!billsError && !request.bills_snapshot}
              snapshot={isClosed && !!request.bills_snapshot}
            />

            {(items.length > 0 || isPending) && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <ShieldCheck className='h-4 w-4' />
                    Clearance Checklist
                  </CardTitle>
                  <CardDescription>
                    {isPending && canTick
                      ? 'Tick each item once it is cleared. Every required item must be ticked before approval.'
                      : 'Items the warden confirms before the bed is released.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {items.length === 0 && (
                    <p className='text-sm text-muted-foreground'>No checklist items apply to this request.</p>
                  )}
                  {items.map((item) => (
                    <ChecklistRow key={item.id} requestId={id} item={item} canEdit={canTick && isPending} />
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Documents</CardTitle>
                <CardDescription>Attached supporting documents.</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUploader
                  vacateRequestId={id}
                  documents={request.documents ?? []}
                  readOnly={!isDraft || request.submitted_by_id !== profile?.id}
                  requireMedicalCert={request.reason_type === 'medical'}
                />
              </CardContent>
            </Card>
          </div>

          <div className='space-y-6'>
            {isDraft && request.submitted_by_id === profile?.id && (
              <Card>
                <CardContent className='p-4 space-y-3'>
                  <p className='text-sm text-muted-foreground'>
                    This request is still a draft. Submit it so the warden can review it.
                  </p>
                  <Button className='w-full' onClick={() => submitMut.mutate(id)} disabled={submitMut.isPending}>
                    {submitMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                    Submit Request
                  </Button>
                </CardContent>
              </Card>
            )}

            {isPending && canApprove && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Warden Decision</CardTitle>
                  <CardDescription>
                    Approving vacates the bed, moves the learner to Day Scholar and clears the hostel and mess
                    categories.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {blockers.length > 0 && (
                    <ul className='rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1'>
                      {blockers.map((b) => (
                        <li key={b} className='flex items-start gap-1.5'>
                          <AlertTriangle className='h-3.5 w-3.5 mt-px shrink-0' />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button className='w-full' disabled={!canApproveNow || approveMut.isPending} onClick={() => setApproveOpen(true)}>
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    Approve &amp; Vacate
                  </Button>
                  <Button className='w-full' variant='outline' onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </CardContent>
              </Card>
            )}

            {isPending && !canApprove && (
              <Card>
                <CardContent className='p-4 text-sm text-muted-foreground'>
                  With the warden. Bills and the clearance checklist are checked before the bed is released.
                </CardContent>
              </Card>
            )}

            {isClosed && (
              <Card>
                <CardContent className='p-4 space-y-2'>
                  <div className='flex items-center gap-2'>
                    {request.status === 'completed' && <CheckCircle2 className='h-5 w-5 text-green-600' />}
                    {request.status === 'rejected' && <AlertCircle className='h-5 w-5 text-destructive' />}
                    {request.status === 'cancelled' && <X className='h-5 w-5 text-muted-foreground' />}
                    <span className='font-medium'>{STATUS_LABEL[request.status]}</span>
                  </div>
                  {request.completed_at && (
                    <p className='text-xs text-muted-foreground'>on {new Date(request.completed_at).toLocaleString()}</p>
                  )}
                  {request.approval_remarks && (
                    <p className='text-xs text-muted-foreground'>Warden remarks: {request.approval_remarks}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Approve */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className='max-w-[480px]'>
          <DialogHeader>
            <DialogTitle>Approve and vacate?</DialogTitle>
            <DialogDescription>
              The bed is released immediately, {learnerName} becomes a Day Scholar and the hostel / mess
              categories are cleared. This cannot be undone from here.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder='Remarks (optional)'
            rows={3}
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setApproveOpen(false)} disabled={approveMut.isPending}>
              Back
            </Button>
            <Button onClick={handleApprove} disabled={approveMut.isPending}>
              {approveMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Approve &amp; Vacate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className='max-w-[480px]'>
          <DialogHeader>
            <DialogTitle>Reject this vacate request?</DialogTitle>
            <DialogDescription>The bed goes back to active and the learner stays in the hostel.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder='Reason (required)' rows={3} />
          <DialogFooter>
            <Button variant='outline' onClick={() => setRejectOpen(false)} disabled={rejectMut.isPending}>
              Back
            </Button>
            <Button variant='destructive' onClick={handleReject} disabled={!reason.trim() || rejectMut.isPending}>
              {rejectMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className='max-w-[480px]'>
          <DialogHeader>
            <DialogTitle>Cancel this vacate request?</DialogTitle>
            <DialogDescription>
              The bed goes back to <em>active</em>. A fresh request can be raised later if needed.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder='Reason for cancelling (required)' rows={3} />
          <DialogFooter>
            <Button variant='outline' onClick={() => setCancelOpen(false)} disabled={cancelMut.isPending}>
              Keep Request
            </Button>
            <Button variant='destructive' onClick={handleCancel} disabled={!reason.trim() || cancelMut.isPending}>
              {cancelMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Cancel Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-[120px_1fr] gap-3 items-start'>
      <span className='text-xs text-muted-foreground uppercase tracking-wide pt-1'>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function BillsCard({
  bills,
  loading,
  error,
  snapshot,
}: {
  bills: VacateBillStatus | null | undefined;
  loading: boolean;
  error: boolean;
  snapshot: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base flex items-center gap-2'>
          <Receipt className='h-4 w-4' />
          Hostel &amp; Mess Bills
        </CardTitle>
        <CardDescription>
          {snapshot
            ? 'Bill position recorded when the request was approved.'
            : 'Every hostel, mess and upgrade bill, all years. All must be paid before approval.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {loading ? (
          <div className='flex justify-center py-6'>
            <Loader2 className='h-5 w-5 animate-spin text-primary' />
          </div>
        ) : error || !bills ? (
          <p className='text-sm text-destructive'>Bill status could not be loaded.</p>
        ) : (
          <>
            {bills.total_outstanding > 0 ? (
              <div className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm'>
                <span className='font-medium text-destructive'>{formatInr(bills.total_outstanding)} outstanding</span>{' '}
                across {bills.unpaid_count} bill(s)
                {bills.overdue_amount > 0 && <> · {formatInr(bills.overdue_amount)} overdue</>}
              </div>
            ) : (
              <div className='rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 flex items-center gap-2'>
                <CheckCircle2 className='h-4 w-4' />
                {bills.bills.length === 0 ? 'No hostel or mess bills on record.' : 'All hostel and mess bills are cleared.'}
              </div>
            )}
            {!bills.has_learner_link && (
              <p className='text-xs text-muted-foreground'>
                This resident has no learner record, so no learner bills apply.
              </p>
            )}
            {bills.bills.length > 0 && (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                      <TableHead className='text-right'>Paid</TableHead>
                      <TableHead className='text-right'>Pending</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.bills.map((b) => (
                      <TableRow key={b.bill_id}>
                        <TableCell className='text-sm'>{b.category_name ?? b.description ?? '—'}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>{b.year_name ?? '—'}</TableCell>
                        <TableCell className='text-right text-sm'>{formatInr(b.amount)}</TableCell>
                        <TableCell className='text-right text-sm'>{formatInr(b.paid)}</TableCell>
                        <TableCell className='text-right text-sm font-medium'>{formatInr(b.pending)}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>{b.due_date ?? '—'}</TableCell>
                        <TableCell>
                          {b.pending === 0 ? (
                            <Badge variant='success'>Paid</Badge>
                          ) : b.is_overdue ? (
                            <Badge variant='destructive'>Overdue</Badge>
                          ) : (
                            <Badge variant='secondary'>Unpaid</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({
  requestId,
  item,
  canEdit,
}: {
  requestId: string;
  item: HostelClearanceItem;
  canEdit: boolean;
}) {
  const setItem = useSetChecklistItem();
  const [notes, setNotes] = useState(item.notes ?? '');
  const [showNotes, setShowNotes] = useState(false);

  const save = (cleared: boolean) =>
    setItem.mutate({ itemId: item.id, requestId, cleared, notes: notes.trim() || null });

  return (
    <div className='rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        <Checkbox
          checked={item.is_cleared}
          disabled={!canEdit || setItem.isPending}
          onCheckedChange={(v) => save(!!v)}
          aria-label={item.item_label}
        />
        <div className='flex-1 min-w-0 flex items-center gap-2'>
          <span className={'text-sm ' + (item.is_cleared ? 'text-muted-foreground' : 'font-medium')}>
            {item.item_label}
          </span>
          {item.is_required ? (
            <Badge variant='outline' className='text-xs'>Required</Badge>
          ) : (
            <Badge variant='secondary' className='text-xs'>Optional</Badge>
          )}
        </div>
        {canEdit && (
          <Button size='sm' variant='ghost' onClick={() => setShowNotes((s) => !s)}>
            {showNotes ? 'Hide' : 'Remarks'}
          </Button>
        )}
      </div>
      {canEdit && (showNotes || item.notes) && (
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes.trim() !== (item.notes ?? '') && save(item.is_cleared)}
          placeholder='Remarks'
          className='mt-2 text-xs'
        />
      )}
      {!canEdit && item.notes && <p className='text-xs text-muted-foreground mt-2'>{item.notes}</p>}
      {item.is_cleared && item.cleared_at && (
        <p className='text-[11px] text-muted-foreground mt-1'>
          Cleared {new Date(item.cleared_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
