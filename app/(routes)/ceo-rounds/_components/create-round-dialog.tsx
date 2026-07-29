'use client';

/**
 * Log-a-round dialog. institution_id + created_by are set by the service from
 * the signed-in session. Attendees + tasks + the summary are managed afterwards
 * in the round detail view.
 */

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { CeoRoundsService } from '@/lib/services/ceo-rounds/ceo-rounds-service';

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

interface CreateRoundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  onCreated: () => void;
}

export function CreateRoundDialog({
  open,
  onOpenChange,
  institutionId,
  onCreated
}: CreateRoundDialogProps) {
  const [roundDate, setRoundDate] = useState(today());
  const [theme, setTheme] = useState('');
  const [decision, setDecision] = useState('');
  const [summaryAuthor, setSummaryAuthor] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; full_name: string | null }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && institutionId) {
      CeoRoundsService.listCandidates(institutionId).then(setCandidates);
    }
  }, [open, institutionId]);

  const canSubmit = !!roundDate && !!theme.trim();

  const reset = () => {
    setRoundDate(today());
    setTheme('');
    setDecision('');
    setSummaryAuthor('');
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await CeoRoundsService.createRound({
        round_date: roundDate,
        theme,
        decision: decision || null,
        summary_author_id: summaryAuthor || null
      });
      toast.success('Round logged.');
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log the round.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a round</DialogTitle>
          <DialogDescription>
            The day, the theme, and the decision. Add who took part and the follow-up
            tasks once the round is created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={roundDate}
                onChange={(e) => setRoundDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Summary written by (optional)</Label>
              <Select
                value={summaryAuthor || 'none'}
                onValueChange={(v) => setSummaryAuthor(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign the rotating associate…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned yet</SelectItem>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name || 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Theme <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="What was this round mainly about?"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label>Decision (optional)</Label>
            <Textarea
              placeholder="The key decision taken in this round, if any."
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? 'Logging…' : 'Log round'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
