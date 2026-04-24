'use client';

// Compact inline action form for warden / chief warden at their respective stages.
// Shows Approve / Reject buttons; reject opens a reason input.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useAdvanceVacate, useRejectVacate } from '@/hooks/campus-living/use-hostel-vacate';
import { useAuth } from '@/hooks/use-auth';
import { Check, Loader2, X } from 'lucide-react';

interface ApproveRejectFormProps {
  requestId: string;
  stageLabel: string;      // e.g. "Warden Approval"
  disabled?: boolean;
}

export function ApproveRejectForm({ requestId, stageLabel, disabled }: ApproveRejectFormProps) {
  const { profile } = useAuth();
  const advanceMut = useAdvanceVacate();
  const rejectMut = useRejectVacate();
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [remarks, setRemarks] = useState('');

  const isPending = advanceMut.isPending || rejectMut.isPending;

  async function handleApprove() {
    if (!profile) return;
    await advanceMut.mutateAsync({
      requestId,
      actorId: profile.id,
      action: 'approve',
      remarks: remarks || undefined,
    });
    setMode('idle');
    setRemarks('');
  }

  async function handleReject() {
    if (!profile || !remarks.trim()) return;
    await rejectMut.mutateAsync({
      requestId,
      actorId: profile.id,
      reason: remarks,
    });
    setMode('idle');
    setRemarks('');
  }

  if (disabled) {
    return (
      <Card>
        <CardContent className='p-3 text-sm text-muted-foreground'>
          You do not have permission to act on this stage, or this request is not
          currently at the <strong>{stageLabel}</strong> stage.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className='p-4 space-y-3'>
        <p className='text-sm font-medium'>Your action at: {stageLabel}</p>

        {mode !== 'idle' && (
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={
              mode === 'reject'
                ? 'Reason for rejection (required)'
                : 'Remarks (optional)'
            }
            rows={3}
            disabled={isPending}
          />
        )}

        <div className='flex items-center gap-2'>
          {mode === 'idle' && (
            <>
              <Button
                onClick={() => setMode('approve')}
                className='flex-1'
                disabled={isPending}
              >
                <Check className='mr-2 h-4 w-4' />
                Approve
              </Button>
              <Button
                variant='destructive'
                onClick={() => setMode('reject')}
                className='flex-1'
                disabled={isPending}
              >
                <X className='mr-2 h-4 w-4' />
                Reject
              </Button>
            </>
          )}

          {mode === 'approve' && (
            <>
              <Button onClick={handleApprove} disabled={isPending} className='flex-1'>
                {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Confirm Approve
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setMode('idle');
                  setRemarks('');
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </>
          )}

          {mode === 'reject' && (
            <>
              <Button
                variant='destructive'
                onClick={handleReject}
                disabled={isPending || !remarks.trim()}
                className='flex-1'
              >
                {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Confirm Reject
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setMode('idle');
                  setRemarks('');
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
