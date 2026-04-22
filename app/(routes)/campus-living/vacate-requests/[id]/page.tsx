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
  const canActWarden = permissions?.includes('campus_living.vacate_requests.approve_warden');
  const canActChief = permissions?.includes('campus_living.vacate_requests.approve_chief');
  const canMarkClearance = permissions?.includes('campus_living.vacate_requests.mark_clearance');
  const canFinalize = permissions?.includes('campus_living.vacate_requests.finalize');

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
            {/* Parent stage info */}
            {isParentStage && (
              <Card className='border-amber-200'>
                <CardHeader>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <Clock className='h-4 w-4 text-amber-600' />
                    Waiting for Parent Consent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    Parent receives an OTP SMS. Once consent is recorded, the request advances
                    to warden review.
                  </p>
                  <p className='text-xs text-muted-foreground mt-2 italic'>
                    OTP dispatch is wired in a follow-up PR — this stage currently requires
                    hostel office to advance via engine control.
                  </p>
                </CardContent>
              </Card>
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
