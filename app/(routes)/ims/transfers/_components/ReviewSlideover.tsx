'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useApproveImsIndent, useRejectImsIndent } from '@/hooks/ims/use-ims-indents';
import { usePermissions } from '@/hooks/use-permissions';
import { INDENT_URGENCY_CONFIG } from '@/types/ims';
import type { ImsIndentRequest } from '@/types/ims';
import { toast } from 'sonner';

interface ReviewSlideoverProps {
  transfer: ImsIndentRequest;
  centralStoreId: string;
  onClose: () => void;
}

export function ReviewSlideover({ transfer, onClose }: ReviewSlideoverProps) {
  const { userProfile } = usePermissions();
  const approve = useApproveImsIndent();
  const reject = useRejectImsIndent();
  const [note, setNote] = useState('');

  const urgencyCfg = INDENT_URGENCY_CONFIG[transfer.urgency];

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ id: transfer.id, userId: userProfile?.id ?? '' });
      toast.success(`Request ${transfer.indent_number} approved.`);
      onClose();
    } catch {
      toast.error('Failed to approve. Please try again.');
    }
  };

  const handleDecline = async () => {
    if (!note.trim()) {
      toast.error('Add a reason to decline.');
      return;
    }
    try {
      await reject.mutateAsync({ id: transfer.id, userId: userProfile?.id ?? '', reason: note });
      toast.success(`Request ${transfer.indent_number} declined.`);
      onClose();
    } catch {
      toast.error('Failed to decline. Please try again.');
    }
  };

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review {transfer.indent_number}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            From: {transfer.source_store?.name ?? '—'}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Badge variant={urgencyCfg.variant}>{urgencyCfg.label}</Badge>
          </div>

          <div>
            <p className="text-sm font-medium">Purpose</p>
            <p className="text-sm text-muted-foreground">{transfer.purpose}</p>
          </div>

          {transfer.notes && (
            <div>
              <p className="text-sm font-medium">Notes from store</p>
              <p className="text-sm text-muted-foreground">{transfer.notes}</p>
            </div>
          )}

          <div>
            <Label>Response note (required to decline)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional for approval, required for decline"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDecline}
              disabled={reject.isPending}
            >
              Decline
            </Button>
            <Button
              className="flex-1"
              onClick={handleApprove}
              disabled={approve.isPending}
            >
              Approve & Pack →
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
