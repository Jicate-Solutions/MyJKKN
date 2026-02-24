'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RequestTimeline } from './request-timeline';
import { RequestApprovalPanel } from './request-approval-panel';
import { format } from 'date-fns';
import {
  FileText,
  User,
  Building,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Circle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ServiceRequest,
  ServiceRequestApprovalStep,
  ProcessApprovalDto,
} from '@/types/service-request';

interface RequestDetailViewProps {
  request: ServiceRequest;
  canApprove?: boolean;
  currentApprovalStep?: ServiceRequestApprovalStep | null;
  onProcessApproval?: (data: ProcessApprovalDto) => void;
  isProcessing?: boolean;
}

/** Maps field_key → field_label using the service type's field definitions */
function buildFieldLabelMap(request: ServiceRequest): Record<string, string> {
  const map: Record<string, string> = {};
  if (request.service_type?.fields) {
    for (const field of request.service_type.fields) {
      map[field.field_key] = field.field_label;
    }
  }
  return map;
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

export function RequestDetailView({
  request,
  canApprove,
  currentApprovalStep,
  onProcessApproval,
  isProcessing,
}: RequestDetailViewProps) {
  const fieldLabelMap = buildFieldLabelMap(request);
  const approvalSteps = [...(request.service_type?.approval_steps || [])].sort(
    (a, b) => a.step_order - b.step_order
  );
  const currentStepOrder = request.current_approval_step || 0;

  const isCancelled = request.status === 'cancelled';
  const isRejected = request.status === 'rejected';
  const isFullyApproved = ['approved', 'fulfilled', 'closed'].includes(request.status);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Left Column ─────────────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {/* Request Information */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Request Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem icon={User} label="Requester" value={request.requester?.full_name} />
              {request.institution?.name && (
                <InfoItem icon={Building} label="Institution" value={request.institution.name} />
              )}
              {request.submitted_at && (
                <InfoItem
                  icon={Calendar}
                  label="Submitted"
                  value={format(new Date(request.submitted_at), 'MMM dd, yyyy • hh:mm a')}
                />
              )}
              {request.fulfilled_at && (
                <InfoItem
                  icon={CheckCircle2}
                  label="Fulfilled"
                  value={format(new Date(request.fulfilled_at), 'MMM dd, yyyy • hh:mm a')}
                />
              )}
            </div>

            {/* Requester context (programme, year, etc.) */}
            {request.requester_context &&
              Object.keys(request.requester_context).length > 0 && (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(request.requester_context).map(([key, value]) =>
                      value ? (
                        <div key={key}>
                          <p className="text-xs text-muted-foreground capitalize mb-0.5">
                            {key.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm font-medium">{String(value)}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                </>
              )}
          </CardContent>
        </Card>

        {/* Approval Progress Stepper */}
        {approvalSteps.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Approval Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                {approvalSteps.map((step, idx) => {
                  const isDone =
                    isFullyApproved || step.step_order < currentStepOrder;
                  const isCurrent =
                    !isCancelled &&
                    !isRejected &&
                    !isFullyApproved &&
                    step.step_order === currentStepOrder;
                  const isRej =
                    isRejected && step.step_order === currentStepOrder;
                  const isLast = idx === approvalSteps.length - 1;

                  return (
                    <div key={step.id} className="flex gap-3">
                      {/* Step indicator + connector line */}
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors',
                            isDone
                              ? 'border-green-500 bg-green-50 dark:bg-green-950'
                              : isCurrent
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                              : isRej
                              ? 'border-red-400 bg-red-50 dark:bg-red-950'
                              : 'border-muted bg-muted/30'
                          )}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : isCurrent ? (
                            <Clock className="h-4 w-4 text-blue-600" />
                          ) : isRej ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </div>
                        {!isLast && (
                          <div
                            className={cn(
                              'w-0.5 h-8 my-1 rounded-full',
                              isDone
                                ? 'bg-green-300 dark:bg-green-800'
                                : 'bg-muted'
                            )}
                          />
                        )}
                      </div>

                      {/* Step label */}
                      <div className={cn('pb-5 min-w-0', isLast && 'pb-0')}>
                        <p
                          className={cn(
                            'text-sm font-medium leading-tight',
                            isDone && 'text-green-700 dark:text-green-400',
                            isCurrent && 'text-blue-700 dark:text-blue-400',
                            isRej && 'text-red-600 dark:text-red-400',
                            !isDone && !isCurrent && !isRej && 'text-muted-foreground'
                          )}
                        >
                          {step.step_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {step.approver_role} · Step {step.step_order}
                          {isCurrent && ' — Awaiting approval'}
                          {isDone && ' — Approved'}
                          {isRej && ' — Rejected'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form Data — uses real field labels from service type definition */}
        {request.form_data && Object.keys(request.form_data).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                Request Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {Object.entries(request.form_data).map(([key, value]) => (
                  <div key={key} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      {fieldLabelMap[key] || key.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-medium break-words">
                      {typeof value === 'boolean'
                        ? value
                          ? 'Yes'
                          : 'No'
                        : String(value || '—')}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attachments */}
        {request.attachments && request.attachments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {request.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{att.file_name}</p>
                      {att.file_size && (
                        <p className="text-xs text-muted-foreground">
                          {(att.file_size / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  </div>
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline shrink-0 ml-3"
                  >
                    Download
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Approval History */}
        {request.approvals && request.approvals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Approval History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {request.approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20"
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                      approval.action === 'approved'
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : approval.action === 'rejected'
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-amber-100 dark:bg-amber-900/30'
                    )}
                  >
                    {approval.action === 'approved' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : approval.action === 'rejected' ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">
                        {approval.approval_step?.step_name || `Step ${approval.step_order}`}
                      </p>
                      {approval.acted_at && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(approval.acted_at), 'MMM dd, yyyy')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {approval.approver?.full_name || 'Unknown'}
                    </p>
                    {approval.comments && (
                      <p className="text-sm mt-2 bg-muted/60 rounded-md px-3 py-2">
                        {approval.comments}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Right Column ────────────────────────────── */}
      <div className="space-y-5">
        {/* Cancelled notice */}
        {isCancelled && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5 shrink-0" />
                <span className="font-semibold text-sm">Request Cancelled</span>
              </div>
              {request.cancellation_reason && (
                <p className="text-sm text-muted-foreground pl-7">
                  {request.cancellation_reason}
                </p>
              )}
              {request.cancelled_at && (
                <p className="text-xs text-muted-foreground pl-7">
                  {format(new Date(request.cancelled_at), 'MMM dd, yyyy hh:mm a')}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Approval Actions */}
        {canApprove && onProcessApproval && !isCancelled && (
          <RequestApprovalPanel
            currentStep={currentApprovalStep || null}
            onProcessApproval={onProcessApproval}
            isProcessing={isProcessing}
          />
        )}

        {/* Activity Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RequestTimeline entries={request.timeline || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
