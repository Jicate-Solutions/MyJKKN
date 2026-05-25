'use client';

/**
 * Escalation Queue — shows pending/acknowledged escalations.
 * Director sees count badge + can resolve/dismiss from here.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Check, X, MessageSquare, Paperclip } from 'lucide-react';
import { useEscalations, useUpdateEscalation } from '@/hooks/hr/recruitment-need/use-recruitment-signal';
import { EscalationAttachmentUpload } from './escalation-attachment-upload';
import { formatDateRelative } from './signal-helpers';
import type { HRRecruitmentEscalation, EscalationStatus } from '@/types/hr-recruitment-need';

interface EscalationQueueProps {
  institutionId?: string;
  className?: string;
}

export function EscalationQueue({ institutionId, className }: EscalationQueueProps) {
  const { data: escalations, isLoading } = useEscalations(institutionId, 'pending');
  const { data: acknowledged } = useEscalations(institutionId, 'acknowledged');
  const updateMutation = useUpdateEscalation();

  const [resolveDialog, setResolveDialog] = useState<{
    open: boolean;
    escalation: HRRecruitmentEscalation | null;
    action: 'resolved' | 'dismissed';
  }>({ open: false, escalation: null, action: 'resolved' });
  const [notes, setNotes] = useState('');

  const allItems = [...(escalations ?? []), ...(acknowledged ?? [])];
  const pendingCount = escalations?.length ?? 0;

  function openResolve(esc: HRRecruitmentEscalation, action: 'resolved' | 'dismissed') {
    setResolveDialog({ open: true, escalation: esc, action });
    setNotes('');
  }

  function handleResolve() {
    if (!resolveDialog.escalation) return;
    updateMutation.mutate(
      {
        id: resolveDialog.escalation.id,
        update: { status: resolveDialog.action, resolution_notes: notes || undefined },
      },
      { onSuccess: () => setResolveDialog({ open: false, escalation: null, action: 'resolved' }) }
    );
  }

  function handleAcknowledge(esc: HRRecruitmentEscalation) {
    updateMutation.mutate({
      id: esc.id,
      update: { status: 'acknowledged' as EscalationStatus },
    });
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Escalations
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {pendingCount}
                </Badge>
              )}
            </CardTitle>
          </div>
          {allItems.length === 0 && (
            <CardDescription className="text-xs">No pending escalations</CardDescription>
          )}
        </CardHeader>

        {allItems.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {allItems.map((esc) => (
                <div
                  key={esc.id}
                  className="flex items-start gap-3 p-2.5 rounded-md border bg-background text-sm"
                >
                  <AlertCircle
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      esc.status === 'pending' ? 'text-red-500' : 'text-amber-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{esc.reason}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDateRelative(esc.created_at)}
                      {esc.status === 'acknowledged' && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">
                          Acknowledged
                        </Badge>
                      )}
                    </p>
                    <EscalationAttachmentUpload
                      escalationId={esc.id}
                      documents={esc.documents as any}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {esc.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleAcknowledge(esc)}
                        title="Acknowledge"
                      >
                        <MessageSquare className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-green-600"
                      onClick={() => openResolve(esc, 'resolved')}
                      title="Resolve"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-600"
                      onClick={() => openResolve(esc, 'dismissed')}
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Resolve/Dismiss Dialog */}
      <Dialog
        open={resolveDialog.open}
        onOpenChange={(open) => {
          if (!open) setResolveDialog({ open: false, escalation: null, action: 'resolved' });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {resolveDialog.action === 'resolved' ? 'Resolve' : 'Dismiss'} Escalation
            </DialogTitle>
            <DialogDescription>
              {resolveDialog.escalation?.reason}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Resolution Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this resolution..."
              className="mt-1.5"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialog({ open: false, escalation: null, action: 'resolved' })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolve}
              disabled={updateMutation.isPending}
              variant={resolveDialog.action === 'dismissed' ? 'destructive' : 'default'}
            >
              {updateMutation.isPending ? 'Saving...' : resolveDialog.action === 'resolved' ? 'Resolve' : 'Dismiss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
