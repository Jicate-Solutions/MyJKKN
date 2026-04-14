'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  FileText,
  ExternalLink,
  ArrowLeft,
  User,
  Video,
  Palette,
} from 'lucide-react';
import {
  useDeliverable,
  useApproveDeliverable,
  useRejectDeliverable,
} from '@/hooks/solutions/use-content';

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  review: { label: 'Needs Review', color: 'bg-blue-100 text-blue-800', icon: Eye },
  revision: { label: 'Revision', color: 'bg-pink-100 text-pink-800', icon: XCircle },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
};

const divisionIcons: Record<string, React.ElementType> = {
  video: Video,
  design: Palette,
  writing: FileText,
  animation: Video,
  social: Palette,
  other: FileText,
};

export function DeliverableDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: rawResponse, isLoading, error } = useDeliverable(id);
  const approveDeliverable = useApproveDeliverable();
  const rejectDeliverable = useRejectDeliverable();
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const response = rawResponse as any;
  const deliverable = response?.data || response;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load deliverable. It may not exist.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!deliverable) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Deliverable not found.</AlertDescription>
      </Alert>
    );
  }

  const status = statusConfig[deliverable.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const division = deliverable.order?.division || 'other';
  const DivisionIcon = divisionIcons[division] || FileText;
  const canApprove = deliverable.status === 'review';
  const canReject = deliverable.status === 'review';
  const isActioning = approveDeliverable.isPending || rejectDeliverable.isPending;

  const handleApprove = () => {
    approveDeliverable.mutate(
      { id: deliverable.id, approvedBy: '' },
      {
        onSuccess: () => {
          router.push('/solutions/content/deliverables');
        },
      }
    );
  };

  const handleReject = () => {
    rejectDeliverable.mutate(
      { id: deliverable.id, notes: rejectionNotes || undefined },
      {
        onSuccess: () => {
          setShowRejectForm(false);
          setRejectionNotes('');
          router.push('/solutions/content/deliverables');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/solutions/content/deliverables')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Deliverables
      </Button>

      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DivisionIcon className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle className="text-xl">{deliverable.title}</CardTitle>
                {deliverable.order && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Order: {deliverable.order.order_type?.replace('_', ' ') || 'Content'}
                    {deliverable.order.division && ` / ${deliverable.order.division}`}
                  </p>
                )}
              </div>
            </div>
            <Badge className={status.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {deliverable.file_format && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Format</p>
                <p>{deliverable.file_format}</p>
              </div>
            )}
            {deliverable.revision_count > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Revisions</p>
                <p>{deliverable.revision_count}</p>
              </div>
            )}
            {deliverable.approved_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved At</p>
                <p>{new Date(deliverable.approved_at).toLocaleDateString()}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p>{new Date(deliverable.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* File link */}
          {deliverable.file_url && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">File</p>
              <a
                href={deliverable.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View File
              </a>
            </div>
          )}

          {/* Notes */}
          {deliverable.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
              <p className="text-sm">{deliverable.notes}</p>
            </div>
          )}

          {/* Assigned learners */}
          {deliverable.assignments?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Assigned To</p>
              <div className="flex flex-wrap gap-2">
                {deliverable.assignments.map((assignment: any) => (
                  <Badge key={assignment.id} variant="outline">
                    <User className="h-3 w-3 mr-1" />
                    {assignment.learner?.name || 'Unknown'}
                    {assignment.role && ` (${assignment.role})`}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval actions */}
      {(canApprove || canReject) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showRejectForm ? (
              <div className="flex gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={isActioning}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approveDeliverable.isPending ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectForm(true)}
                  disabled={isActioning}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Request Revision
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  placeholder="Explain what needs to be revised..."
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isActioning}
                  >
                    {rejectDeliverable.isPending ? 'Sending...' : 'Send for Revision'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectionNotes('');
                    }}
                    disabled={isActioning}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {(approveDeliverable.isError || rejectDeliverable.isError) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Action failed. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
