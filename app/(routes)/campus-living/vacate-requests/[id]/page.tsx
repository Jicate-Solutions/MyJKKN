'use client';

// Single vacate request detail page — shows all the request info + approval
// stepper + stage-appropriate action controls + document list + clearance
// checklist. Used by student (read-only + cancel), warden, chief warden,
// and hostel office.

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  useCancelVacate,
  useMarkClearanceItem,
  useFinalizeVacate,
  useGenerateParentOtp,
  useVerifyParentOtp,
} from '@/hooks/campus-living/use-hostel-vacate';
import { ApprovalChainService } from '@/lib/services/approval-chain-service';
import { ApprovalStepper } from '../_components/approval-stepper';
import { DocumentUploader } from '../_components/document-uploader';
import { ApproveRejectForm } from '../_components/approve-reject-form';
import { ArrowLeft, Loader2, AlertCircle, ShieldCheck, X, Send, Clock, CheckCircle2 } from 'lucide-react';
import type { StageDefinition } from '@/types/approval-chain';

export default function VacateRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const { permissions } = usePermissions();
  // usePermissions returns permissions as Record<string, boolean>, not a string[] —
  // use bracket lookup, not .includes(). (Caught 2026-04-23 when the detail page
  // crashed with "l?.includes is not a function" on the first real request.)
  const canActWarden = !!permissions?.['campus_living.vacate_requests.approve_warden'];
  const canActChief = !!permissions?.['campus_living.vacate_requests.approve_chief'];
  const canMarkClearance = !!permissions?.['campus_living.vacate_requests.mark_clearance'];
  const canFinalize = !!permissions?.['campus_living.vacate_requests.finalize'];

  const { data: request, isLoading, refetch } = useVacateRequest(id);

  const { data: run } = useQuery({
    queryKey: ['approval-chain', 'run-by-subject', 'hostel_vacate', id],
    queryFn: () => ApprovalChainService.getRunBySubject('hostel_vacate', id),
    enabled: !!id,
  });

  const { data: stages } = useQuery({
    queryKey: ['approval-chain', 'rule-stages', run?.rule_id ?? ''],
    queryFn: async () => {
      if (!run?.rule_id) return [];
      const rule = await ApprovalChainService.getRule(run.rule_id);
      return rule.stages as StageDefinition[];
    },
    enabled: !!run?.rule_id,
  });

  const cancelMut = useCancelVacate();
  const markClearanceMut = useMarkClearanceItem();
  const finalizeMut = useFinalizeVacate();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (isLoading || !request) {
    return (
      <ContentLayout title='Vacate Request'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  const currentStage =
    stages && run ? stages[run.current_stage_idx] : undefined;

  const isSubmitter = request.submitted_by_id === user?.id;
  const canCancel =
    isSubmitter && ['draft', 'pending_parent', 'pending_warden'].includes(request.status);

  const allCleared = (request.clearance_items ?? []).every((i) => !i.is_required || i.is_cleared);
  const canFinalizeNow = canFinalize && request.status === 'pending_dues' && allCleared;

  const stageActor = currentStage?.actor_role_key;
  const isWardenStage = request.status === 'pending_warden';
  const isChiefStage = request.status === 'pending_chief';
  const isDuesStage = request.status === 'pending_dues';
  const isParentStage = request.status === 'pending_parent';

  const showApprovalForm =
    (isWardenStage && canActWarden) || (isChiefStage && canActChief);

  async function handleCancel() {
    if (!user || !cancelReason.trim()) return;
    await cancelMut.mutateAsync({ requestId: id, actorId: user.id, reason: cancelReason });
    setCancelOpen(false);
    refetch();
  }

  async function handleMarkClearance(itemId: string, cleared: boolean, notes: string) {
    if (!user) return;
    await markClearanceMut.mutateAsync({
      itemId,
      cleared,
      notes: notes || null,
      clearedBy: user.id,
    });
    refetch();
  }

  async function handleFinalize() {
    if (!user) return;
    await finalizeMut.mutateAsync({ requestId: id, actorId: user.id });
    refetch();
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
            <h1 className='text-2xl font-bold py-1'>Vacate Request Detail</h1>
            <p className='text-sm text-muted-foreground'>
              Submitted by {request.learner_profile?.full_name ?? 'Unknown'} on{' '}
              {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          {canCancel && (
            <Button variant='outline' onClick={() => setCancelOpen(true)}>
              <X className='mr-2 h-4 w-4' />
              Cancel Request
            </Button>
          )}
        </div>

        {/* Approval stepper */}
        {stages && run && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Approval Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalStepper
                stages={stages}
                status={request.status}
                currentStageIdx={run.current_stage_idx}
              />
              {request.status === 'rejected' && request.rejected_reason && (
                <div className='mt-3 p-2 rounded-md border border-destructive/30 bg-destructive/5 text-sm'>
                  <span className='font-medium text-destructive'>Rejected:</span>{' '}
                  {request.rejected_reason}
                </div>
              )}
              {request.status === 'cancelled' && request.cancelled_reason && (
                <div className='mt-3 p-2 rounded-md border bg-muted text-sm'>
                  <span className='font-medium'>Cancelled:</span> {request.cancelled_reason}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Main info */}
          <div className='lg:col-span-2 space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Request Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <Row label='Reason'>
                  <div className='flex items-center gap-2'>
                    <Badge variant='outline' className='capitalize'>
                      {request.reason_type.replace(/_/g, ' ')}
                    </Badge>
                    {request.has_medical_grounds && (
                      <Badge variant='destructive'>Medical</Badge>
                    )}
                  </div>
                </Row>
                <Row label='Resident type'>
                  <Badge variant='secondary' className='capitalize'>
                    {request.resident_type}
                  </Badge>
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
                {request.submitted_on_behalf_of_id && (
                  <Row label='Filed on behalf'>
                    <Badge variant='outline'>Yes — admin delegation</Badge>
                  </Row>
                )}
                {request.actual_vacate_date && (
                  <Row label='Actual vacate date'>
                    <span>{request.actual_vacate_date}</span>
                  </Row>
                )}
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Documents</CardTitle>
                <CardDescription>Attached supporting documents.</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUploader
                  vacateRequestId={id}
                  documents={request.documents ?? []}
                  readOnly={!isSubmitter || request.status !== 'draft'}
                  requireMedicalCert={request.reason_type === 'medical'}
                />
              </CardContent>
            </Card>

            {/* Clearance checklist (visible only once engine reaches dues stage, or for audit) */}
            {(request.clearance_items ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <ShieldCheck className='h-4 w-4' />
                    Dues Clearance Checklist
                  </CardTitle>
                  <CardDescription>
                    All required items must be cleared before finalize.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {(request.clearance_items ?? [])
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((item) => (
                      <ClearanceItemRow
                        key={item.id}
                        item={item}
                        canEdit={!!canMarkClearance && isDuesStage}
                        onToggle={(cleared, notes) => handleMarkClearance(item.id, cleared, notes)}
                      />
                    ))}
                  {canFinalize && (
                    <div className='pt-3 border-t'>
                      <Button
                        onClick={handleFinalize}
                        disabled={!canFinalizeNow || finalizeMut.isPending}
                        className='w-full'
                      >
                        {finalizeMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                        <CheckCircle2 className='mr-2 h-4 w-4' />
                        Finalize Vacate
                      </Button>
                      {!allCleared && (
                        <p className='text-xs text-muted-foreground text-center mt-1'>
                          Clear all required items to enable finalize.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Side column: action area */}
          <div className='space-y-6'>
            {/* Parent stage OTP flow */}
            {isParentStage && (
              <ParentOtpCard
                requestId={id}
                hasActiveOtp={!!request.parent_consent_otp}
                otpExpiresAt={request.parent_consent_otp_expires_at ?? null}
                canAct={!!canMarkClearance}
              />
            )}

            {/* Approval form for current actor */}
            {showApprovalForm && currentStage && (
              <ApproveRejectForm
                requestId={id}
                stageLabel={currentStage.stage_label}
                disabled={false}
              />
            )}

            {isDuesStage && !canMarkClearance && !canFinalize && (
              <Card>
                <CardContent className='p-4 text-sm text-muted-foreground'>
                  In dues clearance. Hostel office will mark items and finalize.
                </CardContent>
              </Card>
            )}

            {/* Empty stub for closed/approved states */}
            {['approved', 'completed', 'rejected', 'cancelled'].includes(request.status) && (
              <Card>
                <CardContent className='p-4 space-y-2'>
                  <div className='flex items-center gap-2'>
                    {request.status === 'completed' && <CheckCircle2 className='h-5 w-5 text-green-600' />}
                    {request.status === 'rejected' && <AlertCircle className='h-5 w-5 text-destructive' />}
                    {request.status === 'cancelled' && <X className='h-5 w-5 text-muted-foreground' />}
                    <span className='font-medium capitalize'>{request.status}</span>
                  </div>
                  {request.completed_at && (
                    <p className='text-xs text-muted-foreground'>
                      on {new Date(request.completed_at).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className='max-w-[480px]'>
          <DialogHeader>
            <DialogTitle>Cancel this vacate request?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Your bed will be released back to <em>active</em>. You can
              submit a fresh request later if needed.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2 py-2'>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder='Reason for cancelling (required)'
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCancelOpen(false)} disabled={cancelMut.isPending}>
              Keep Request
            </Button>
            <Button
              variant='destructive'
              onClick={handleCancel}
              disabled={!cancelReason.trim() || cancelMut.isPending}
            >
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

function ClearanceItemRow({
  item,
  canEdit,
  onToggle,
}: {
  item: {
    id: string;
    item_key: string;
    item_label: string;
    is_required: boolean;
    is_cleared: boolean;
    notes: string | null;
    amount_outstanding: number | null;
  };
  canEdit: boolean;
  onToggle: (cleared: boolean, notes: string) => void | Promise<void>;
}) {
  const [localNotes, setLocalNotes] = useState(item.notes ?? '');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className='rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        <Checkbox
          checked={item.is_cleared}
          disabled={!canEdit}
          onCheckedChange={(v) => onToggle(!!v, localNotes)}
        />
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <span className={'text-sm ' + (item.is_cleared ? 'line-through text-muted-foreground' : 'font-medium')}>
              {item.item_label}
            </span>
            {item.is_required && (
              <Badge variant='outline' className='text-xs'>
                Required
              </Badge>
            )}
          </div>
        </div>
        {canEdit && (
          <Button size='sm' variant='ghost' onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide' : 'Notes'}
          </Button>
        )}
      </div>

      {(expanded || item.notes) && canEdit && (
        <div className='mt-2 space-y-2'>
          <Input
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => onToggle(item.is_cleared, localNotes)}
            placeholder='Notes / deduction amount'
            className='text-xs'
          />
        </div>
      )}
      {item.notes && !canEdit && (
        <p className='text-xs text-muted-foreground mt-2'>{item.notes}</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Parent OTP card (PR-C, 2026-04-23)
//
// Two-step flow on the detail page:
//   1. Hostel office / admin clicks "Generate OTP" — a 6-digit code is stored
//      on the request with 30-min expiry. The UI displays it prominently so
//      the hostel office can relay by phone (SMS dispatch is not wired yet —
//      same as hostel_leave today).
//   2. Once parent confirms the OTP, the actor enters it back into the input
//      and clicks Verify. Verify advances the engine past pending_parent.
//
// For learners (resident_type='learner'), this stage is mandatory. The chain
// skips straight to pending_warden for non-learners.
// ══════════════════════════════════════════════════════════════════════════

function ParentOtpCard({
  requestId,
  hasActiveOtp,
  otpExpiresAt,
  canAct,
}: {
  requestId: string;
  hasActiveOtp: boolean;
  otpExpiresAt: string | null;
  canAct: boolean;
}) {
  const { user } = useAuth();
  const [enteredOtp, setEnteredOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const generateMut = useGenerateParentOtp();
  const verifyMut = useVerifyParentOtp();

  if (!canAct) {
    return (
      <Card className='border-amber-200'>
        <CardHeader>
          <CardTitle className='text-base flex items-center gap-2'>
            <Clock className='h-4 w-4 text-amber-600' />
            Waiting for Parent Consent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            Hostel office is generating an OTP for the parent. Once verified, this request
            advances to warden review.
          </p>
        </CardContent>
      </Card>
    );
  }

  const expired =
    !!otpExpiresAt && new Date(otpExpiresAt) < new Date();
  const canGenerateNew = !hasActiveOtp || expired || !!generatedOtp;

  async function handleGenerate() {
    const result = await generateMut.mutateAsync(requestId);
    setGeneratedOtp(result.otp);
    setEnteredOtp('');
  }

  async function handleVerify() {
    if (!user || enteredOtp.length !== 6) return;
    const res = await verifyMut.mutateAsync({
      requestId,
      otp: enteredOtp,
      actorId: user.id,
    });
    if (res.valid) {
      setEnteredOtp('');
      setGeneratedOtp(null);
    }
  }

  return (
    <Card className='border-amber-200'>
      <CardHeader>
        <CardTitle className='text-base flex items-center gap-2'>
          <Clock className='h-4 w-4 text-amber-600' />
          Parent Consent OTP
        </CardTitle>
        <CardDescription>
          Generate a 6-digit OTP and relay it to the parent. They confirm it, you enter it
          back here to advance the request to warden review.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {generatedOtp && (
          <div className='rounded-md border border-amber-300 bg-amber-50 p-3'>
            <p className='text-xs text-muted-foreground uppercase tracking-wide'>
              Active OTP (30 min)
            </p>
            <p className='text-3xl font-mono font-bold tracking-widest text-amber-900 mt-1'>
              {generatedOtp}
            </p>
            <p className='text-xs text-muted-foreground mt-1'>
              Share this with the parent by phone.
            </p>
          </div>
        )}

        {!generatedOtp && hasActiveOtp && !expired && (
          <div className='rounded-md border bg-muted p-2 text-xs text-muted-foreground'>
            An OTP is active on this request. Regenerate to see it again, or enter it below
            if the parent already confirmed.
          </div>
        )}

        {expired && (
          <div className='rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive'>
            Previous OTP expired. Generate a fresh one.
          </div>
        )}

        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            onClick={handleGenerate}
            disabled={generateMut.isPending}
            size='sm'
          >
            {generateMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            <Send className='mr-2 h-4 w-4' />
            {hasActiveOtp ? 'Regenerate' : 'Generate OTP'}
          </Button>
        </div>

        <div className='pt-2 border-t space-y-2'>
          <p className='text-xs font-medium'>Enter parent's 6-digit confirmation</p>
          <div className='flex items-center gap-2'>
            <Input
              value={enteredOtp}
              onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder='XXXXXX'
              className='font-mono text-lg tracking-widest text-center max-w-[140px]'
              inputMode='numeric'
            />
            <Button
              onClick={handleVerify}
              disabled={enteredOtp.length !== 6 || verifyMut.isPending}
            >
              {verifyMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Verify
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
