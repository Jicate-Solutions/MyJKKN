'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RequestStatusBadge } from './request-status-badge';
import { PriorityBadge } from './priority-badge';
import { RequestTimeline } from './request-timeline';
import { RequestApprovalPanel } from './request-approval-panel';
import { format } from 'date-fns';
import { FileText, User, Building, Calendar } from 'lucide-react';
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

export function RequestDetailView({
  request,
  canApprove,
  currentApprovalStep,
  onProcessApproval,
  isProcessing,
}: RequestDetailViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Request Info */}
      <div className="lg:col-span-2 space-y-6">
        {/* Header Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-muted-foreground">
                    {request.request_number}
                  </span>
                  <RequestStatusBadge status={request.status} />
                  {request.priority && <PriorityBadge priority={request.priority} />}
                </div>
                <CardTitle className="text-xl">
                  {request.service_type?.name || 'Service Request'}
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Requester Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Requester:</span>
                <span className="font-medium">{request.requester?.full_name || '-'}</span>
              </div>
              {request.institution?.name && (
                <div className="flex items-center gap-2 text-sm">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Institution:</span>
                  <span className="font-medium">{request.institution.name}</span>
                </div>
              )}
              {request.submitted_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Submitted:</span>
                  <span className="font-medium">
                    {format(new Date(request.submitted_at), 'MMM dd, yyyy hh:mm a')}
                  </span>
                </div>
              )}
              {request.fulfilled_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Fulfilled:</span>
                  <span className="font-medium">
                    {format(new Date(request.fulfilled_at), 'MMM dd, yyyy hh:mm a')}
                  </span>
                </div>
              )}
            </div>

            {/* Requester Context */}
            {request.requester_context && Object.keys(request.requester_context).length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Requester Context</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(request.requester_context).map(([key, value]) =>
                      value ? (
                        <div key={key} className="text-sm">
                          <span className="text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}:
                          </span>{' '}
                          <span className="font-medium">{value}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Form Data Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Request Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {request.form_data && Object.keys(request.form_data).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(request.form_data).map(([key, value]) => (
                  <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1">
                    <span className="text-sm text-muted-foreground capitalize min-w-[140px]">
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span className="text-sm font-medium break-words">
                      {typeof value === 'boolean'
                        ? value ? 'Yes' : 'No'
                        : String(value || '-')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No form data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Attachments */}
        {request.attachments && request.attachments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {request.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2 rounded-md border"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{att.file_name}</span>
                      {att.file_size && (
                        <span className="text-xs text-muted-foreground">
                          ({(att.file_size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </div>
                    <a
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approval History */}
        {request.approvals && request.approvals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approval History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {request.approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="flex items-start justify-between p-3 rounded-md border"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Step {approval.step_order}
                          {approval.approval_step && `: ${approval.approval_step.step_name}`}
                        </span>
                        <Badge
                          variant={
                            approval.action === 'approved' ? 'default' :
                            approval.action === 'rejected' ? 'destructive' : 'secondary'
                          }
                          className="text-xs"
                        >
                          {approval.action}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {approval.approver?.full_name || 'Unknown'}
                      </p>
                      {approval.comments && (
                        <p className="text-sm mt-1 bg-muted/50 rounded p-2">
                          {approval.comments}
                        </p>
                      )}
                    </div>
                    {approval.acted_at && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(approval.acted_at), 'MMM dd, yyyy')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Column - Timeline & Approval */}
      <div className="space-y-6">
        {/* Approval Panel */}
        {canApprove && onProcessApproval && (
          <RequestApprovalPanel
            currentStep={currentApprovalStep || null}
            onProcessApproval={onProcessApproval}
            isProcessing={isProcessing}
          />
        )}

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <RequestTimeline entries={request.timeline || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
