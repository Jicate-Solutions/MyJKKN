'use client';

/**
 * LC-004: OD Pending Approvals - Approve/reject OD requests
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  ClipboardSignature,
  CalendarDays,
  Clock,
  User,
} from 'lucide-react';
import { useApproveOD, useRejectOD } from '@/hooks/learners-council/use-lc-od';
import type { LCODRequest } from '@/types/learners-council';

interface ODApprovalsClientProps {
  initialPending: LCODRequest[];
  approverId: string;
}

export function ODApprovalsClient({ initialPending, approverId }: ODApprovalsClientProps) {
  const [pending, setPending] = useState(initialPending);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [approveComments, setApproveComments] = useState('');

  const approveOD = useApproveOD();
  const rejectOD = useRejectOD();

  const handleApprove = (requestId: string) => {
    approveOD.mutate(
      { requestId, approverId, comments: approveComments || undefined },
      {
        onSuccess: () => {
          setPending((prev) => prev.filter((r) => r.id !== requestId));
          setApproveComments('');
        },
      }
    );
  };

  const handleReject = () => {
    if (!selectedId || !rejectComments.trim()) return;
    rejectOD.mutate(
      { requestId: selectedId, approverId, comments: rejectComments },
      {
        onSuccess: () => {
          setPending((prev) => prev.filter((r) => r.id !== selectedId));
          setRejectDialog(false);
          setRejectComments('');
          setSelectedId(null);
        },
      }
    );
  };

  const openRejectDialog = (id: string) => {
    setSelectedId(id);
    setRejectComments('');
    setRejectDialog(true);
  };

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Pending Approvals</h1>
        <p className="text-sm text-muted-foreground">
          OD requests awaiting your review ({pending.length})
        </p>
      </div>

      {/* Pending Requests */}
      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm mt-1">No OD requests pending your approval.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((req: any) => (
            <Card key={req.id} className="border-l-4 border-l-yellow-400">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {req.request_number}
                      </code>
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        Step {req.current_step || 1}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {(req.requester as any)?.full_name || 'Unknown Learner'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({(req.requester as any)?.email})
                      </span>
                    </div>

                    <p className="text-sm mb-2">{req.reason}</p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        <span>
                          {new Date(req.start_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                          {req.start_date !== req.end_date && (
                            <>
                              {' - '}
                              {new Date(req.end_date).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </>
                          )}
                        </span>
                      </div>
                      <span>{req.duration_hours}h</span>
                      {req.event && (
                        <Badge variant="outline" className="text-xs">
                          Event: {(req.event as any)?.title}
                        </Badge>
                      )}
                      {req.has_academic_conflict && (
                        <Badge variant="destructive" className="text-xs">
                          Academic Conflict
                        </Badge>
                      )}
                    </div>

                    {/* Previous approvals in chain */}
                    {req.approvals && req.approvals.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Previous Approvals
                        </p>
                        {req.approvals.map((a: any) => (
                          <div key={a.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            Step {a.step_order}: {a.approver?.full_name}
                            {a.comments && <span className="italic">- {a.comments}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 ml-4 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(req.id)}
                      disabled={approveOD.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openRejectDialog(req.id)}
                      disabled={rejectOD.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject OD Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-comments">Reason for Rejection *</Label>
              <Textarea
                id="reject-comments"
                placeholder="Provide a reason for rejecting this OD request..."
                value={rejectComments}
                onChange={(e) => setRejectComments(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={!rejectComments.trim() || rejectOD.isPending}
              >
                {rejectOD.isPending ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
