'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { FacultyInitiative } from '@/types/faculty-innovation';

interface Props {
  initiative: FacultyInitiative | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string, reason?: string) => Promise<void>;
}

export function ArchiveInitiativeDialog({ initiative, open, onOpenChange, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!initiative) return;
    setLoading(true);
    try {
      await onConfirm(initiative.id, reason.trim() || undefined);
      setReason('');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive initiative?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{initiative?.title}</span>
            <br />
            This will archive the initiative (soft delete). It will no longer appear in your
            portfolio or the approval queue. This action cannot be undone by you.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1 py-2">
          <Label htmlFor="archive-reason" className="text-sm">
            Reason <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="archive-reason"
            placeholder="e.g. Duplicate submission, changed direction…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Archiving…</>
              : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
