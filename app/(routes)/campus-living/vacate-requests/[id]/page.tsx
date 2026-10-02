'use client';

// Vacate request detail. Used by the learner (read-only + cancel) and by every
// approver in the chain.
//
//   Step 1 bills (automatic) -> 2 Principal -> 3 Warden (checklist + room
//   inspection) -> 4 Mess in-charge -> 5 CAO -> [fine paid] -> vacated.
//
// Every gate (permission per step, unpaid bills, unticked required items, missing
// inspection) is enforced again inside fn_cl_vacate_advance — the disabled button
// here is a convenience, not the control.

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  useAdvanceVacate,
  useRecheckVacateBills,
  useSubmitVacateDraft,
} from '@/hooks/campus-living/use-hostel-vacate';
import { DocumentUploader } from '../_components/document-uploader';
import { BillsCard, formatInr } from '../_components/bills-card';
import { ChecklistRow } from '../_components/checklist-row';
import { DamageInspectionCard } from '../_components/damage-inspection-card';
import { DecisionTimeline } from '../_components/decision-timeline';
import { FineBillCard } from '../_components/fine-bill-card';
import { LearnerDetailsCard } from '../_components/learner-details-card';
import { VacateStepper } from '../_components/vacate-stepper';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  VACATE_REASON_LABELS,
  VACATE_STATUS_LABELS,
  vacateStepPermission,
} from '@/types/hostel-vacate';
import type { VacateRequestStatus } from '@/types/hostel-vacate';

const OPEN_STATUSES: VacateRequestStatus[] = [
  'draft',
  'pending_dues',
  'pending_principal',
  'pending_warden',
  'pending_mess',
  'pending_cao',
];

const STEP_COPY: Partial<
  Record<VacateRequestStatus, { title: string; blurb: string; approve: string; waiting: string }>
> = {
  pending_principal: {
    title: 'Principal Decision',
    blurb: 'Approve to send this request to the Warden for the checklist and room inspection.',
    approve: 'Approve',
    waiting: 'With the Principal.',
  },
  pending_warden: {
    title: 'Warden Decision',
    blurb: 'Tick the clearance checklist, record the room inspection, then approve to send it to the Mess In-charge.',
    approve: 'Approve & send to Mess',
    waiting: 'With the Warden for the checklist and room inspection.',
  },
  pending_mess: {
    title: 'Mess Clearance',
    blurb: 'Confirm the learner has no mess issues. Approving sends the request to the CAO.',
    approve: 'Give mess clearance',
    waiting: 'With the Mess In-charge for clearance.',
  },
  pending_cao: {
    title: 'CAO Final Approval',
    blurb: 'Final approval. Remarks are optional.',
    approve: 'Approve',
    waiting: 'With the CAO for final approval.',
  },
};

export default function VacateRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  // usePermissions returns permissions as Record<string, boolean>; super admins
  // get an empty object and rely on isSuperAdmin, so every gate ORs against it.
  const { permissions, isSuperAdmin } = usePermissions();
  const has = (key: string | null) => isSuperAdmin || (!!key && !!permissions?.[key]);

  const { data: request, isLoading } = useVacateRequest(id);
  const { data: bills, isLoading: billsLoading, error: billsError } = useVacateBillStatus(id, !!request);

  const cancelMut = useCancelVacate();
  const rejectMut = useRejectVacate();
  const advanceMut = useAdvanceVacate();
  const recheckMut = useRecheckVacateBills();
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

  const status = request.status;
  const items = [...(request.clearance_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const damages = request.damages ?? [];
  const approvals = request.approvals ?? [];

  const isDraft = status === 'draft';
  const isClosed = ['completed', 'rejected', 'cancelled'].includes(status);
  const isRequester = request.submitted_by_id === profile?.id || request.learner_id === profile?.id;

  const stepCopy = STEP_COPY[status];
  const canActOnStep = !!stepCopy && has(vacateStepPermission(status));
  const isWardenStep = status === 'pending_warden';
  const canTick = isWardenStep && has('campus_living.vacate_requests.mark_clearance');
  const canStaffCancel = has('campus_living.vacate_requests.cancel');

  const pendingRequired = items.filter((i) => i.is_required && !i.is_cleared).length;
  const billsClear = !!bills && bills.total_outstanding === 0;

  const blockers: string[] = [];
  if (isWardenStep) {
    if (pendingRequired > 0) blockers.push(`${pendingRequired} required checklist item(s) not cleared`);
    if (!request.room_inspected) blockers.push('Room inspection not recorded (damages, or “No damage”)');
  }
  if (status === 'pending_cao') {
    if (billsLoading) blockers.push('Checking bills…');
    else if (billsError || !bills) blockers.push('Bill status could not be loaded');
    else if (!billsClear)
      blockers.push(`${formatInr(bills.total_outstanding)} unpaid across ${bills.unpaid_count} bill(s)`);
  }
  const canApproveNow = canActOnStep && blockers.length === 0;

  const canCancel =
    OPEN_STATUSES.includes(status) && (isRequester || canStaffCancel || canActOnStep);
  const learnerName = request.learner_profile?.full_name ?? 'Unknown';
  const hasFine = request.damage_total > 0;

  const approveLabel =
    status === 'pending_cao'
      ? hasFine
        ? `Approve & raise ${formatInr(request.damage_total)} fine`
        : 'Approve & Vacate'
      : (stepCopy?.approve ?? 'Approve');
  const approveDialogDesc =
    status === 'pending_cao'
      ? hasFine
        ? `A fine bill of ${formatInr(request.damage_total)} is raised for the room damage. ${learnerName} is vacated and the room and bed are released once it is paid.`
        : `The bed is released immediately, ${learnerName} becomes a Day Scholar and the hostel / mess categories are cleared. This cannot be undone from here.`
      : (stepCopy?.blurb ?? '');

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
    await advanceMut.mutateAsync({ requestId: id, remarks: remarks || null });
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
              <Badge variant={status === 'completed' ? 'success' : status === 'rejected' ? 'destructive' : 'secondary'}>
                {VACATE_STATUS_LABELS[status] ?? status}
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

        {!isDraft && (
          <Card>
            <CardContent className='p-4'>
              <VacateStepper request={request} approvals={approvals} />
            </CardContent>
          </Card>
        )}

        {status === 'rejected' && request.rejected_reason && (
          <div className='p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm'>
            <span className='font-medium text-destructive'>Rejected:</span> {request.rejected_reason}
          </div>
        )}
        {status === 'cancelled' && request.cancelled_reason && (
          <div className='p-3 rounded-md border bg-muted text-sm'>
            <span className='font-medium'>Cancelled:</span> {request.cancelled_reason}
          </div>
        )}

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          <div className='lg:col-span-2 space-y-6'>
            <LearnerDetailsCard
              learnerProfileId={request.learner_id}
              fallbackName={learnerName}
              fallbackEmail={request.learner_profile?.email ?? null}
            />

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Request Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
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

            {!isDraft && (
              <BillsCard
                bills={status === 'completed' && request.bills_snapshot ? request.bills_snapshot : bills}
                loading={billsLoading && !request.bills_snapshot}
                error={!!billsError && !request.bills_snapshot}
                snapshot={status === 'completed' && !!request.bills_snapshot}
                onRecheck={status === 'pending_dues' ? () => recheckMut.mutate(id) : undefined}
                rechecking={recheckMut.isPending}
              />
            )}

            {(items.length > 0 || isWardenStep) && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <ShieldCheck className='h-4 w-4' />
                    Step 3 · Clearance Checklist
                  </CardTitle>
                  <CardDescription>
                    {canTick
                      ? 'Tick each item once it is cleared. Every required item must be ticked before approval.'
                      : 'Items the warden confirms before the bed is released.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {items.length === 0 && (
                    <p className='text-sm text-muted-foreground'>No checklist items apply to this request.</p>
                  )}
                  {items.map((item) => (
                    <ChecklistRow key={item.id} requestId={id} item={item} canEdit={canTick} />
                  ))}
                </CardContent>
              </Card>
            )}

            {(isWardenStep || request.room_inspected) && (
              <DamageInspectionCard
                requestId={id}
                damages={damages}
                roomInspected={request.room_inspected}
                damageTotal={request.damage_total}
                canEdit={canTick}
              />
            )}

            {request.fine_bill_id && (
              <FineBillCard
                requestId={id}
                billId={request.fine_bill_id}
                requestStatus={status}
                canComplete={has('campus_living.vacate_requests.approve_cao')}
              />
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
                    This request is still a draft. Submit it to start the approval process.
                  </p>
                  <Button className='w-full' onClick={() => submitMut.mutate(id)} disabled={submitMut.isPending}>
                    {submitMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                    Submit Request
                  </Button>
                </CardContent>
              </Card>
            )}

            {status === 'pending_dues' && (
              <Card>
                <CardContent className='p-4 space-y-2 text-sm text-muted-foreground'>
                  <p>
                    Waiting for the learner&apos;s hostel and mess bills to be cleared. The request moves to the
                    Principal automatically once every bill is paid.
                  </p>
                  {bills && bills.total_outstanding > 0 && (
                    <p className='font-medium text-destructive'>
                      {formatInr(bills.total_outstanding)} outstanding
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {stepCopy && canActOnStep && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>{stepCopy.title}</CardTitle>
                  <CardDescription>{stepCopy.blurb}</CardDescription>
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
                  <Button
                    className='w-full'
                    disabled={!canApproveNow || advanceMut.isPending}
                    onClick={() => setApproveOpen(true)}
                  >
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    {approveLabel}
                  </Button>
                  <Button className='w-full' variant='outline' onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </CardContent>
              </Card>
            )}

            {stepCopy && !canActOnStep && (
              <Card>
                <CardContent className='p-4 text-sm text-muted-foreground'>{stepCopy.waiting}</CardContent>
              </Card>
            )}

            {status === 'pending_fine' && (
              <Card>
                <CardContent className='p-4 text-sm text-muted-foreground'>
                  Approved by the CAO. Waiting for the damage fine to be paid — the learner is vacated automatically
                  once it is.
                </CardContent>
              </Card>
            )}

            {isClosed && (
              <Card>
                <CardContent className='p-4 space-y-2'>
                  <div className='flex items-center gap-2'>
                    {status === 'completed' && <CheckCircle2 className='h-5 w-5 text-green-600' />}
                    {status === 'rejected' && <AlertCircle className='h-5 w-5 text-destructive' />}
                    {status === 'cancelled' && <X className='h-5 w-5 text-muted-foreground' />}
                    <span className='font-medium'>
                      {status === 'completed' ? 'Vacated' : VACATE_STATUS_LABELS[status]}
                    </span>
                  </div>
                  {request.completed_at && (
                    <p className='text-xs text-muted-foreground'>on {new Date(request.completed_at).toLocaleString()}</p>
                  )}
                  {request.approval_remarks && (
                    <p className='text-xs text-muted-foreground'>CAO remarks: {request.approval_remarks}</p>
                  )}
                </CardContent>
              </Card>
            )}

            <DecisionTimeline approvals={approvals} />
          </div>
        </div>
      </div>

      {/* Approve */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className='max-w-[480px]'>
          <DialogHeader>
            <DialogTitle>{approveLabel}?</DialogTitle>
            <DialogDescription>{approveDialogDesc}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder='Remarks (optional)'
            rows={3}
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setApproveOpen(false)} disabled={advanceMut.isPending}>
              Back
            </Button>
            <Button onClick={handleApprove} disabled={advanceMut.isPending}>
              {advanceMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {approveLabel}
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
