'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAddCdcEnrollment } from '@/hooks/cdc/use-cdc-training';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programmeId: string;
}

export function AddEnrollmentDialog({ open, onOpenChange, programmeId }: Props) {
  const addMutation = useAddCdcEnrollment();
  const [learnerId, setLearnerId] = useState('');
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!learnerId.trim()) return;
    await addMutation.mutateAsync({
      programme_id: programmeId,
      learner_id: learnerId.trim(),
      notes: notes || null,
    });
    setLearnerId('');
    setNotes('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Learner to Programme</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="learner_id">Learner ID (UUID)</Label>
            <Input
              id="learner_id"
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value)}
              placeholder="Paste learner UUID"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enroll_notes">Notes (optional)</Label>
            <Input
              id="enroll_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Batch, cohort, special notes..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={addMutation.isPending || !learnerId.trim()}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enroll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
