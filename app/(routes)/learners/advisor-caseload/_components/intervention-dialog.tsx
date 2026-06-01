'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { useCreateIntervention } from '@/hooks/learners/use-learner-risk';
import type { InterventionType } from '@/services/learner-risk-service';

const INTERVENTION_TYPE_OPTIONS: {
  value: InterventionType;
  label: string;
}[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'meeting', label: 'In-Person Meeting' },
  { value: 'referral_counselor', label: 'Refer to Counselor' },
  { value: 'referral_hod', label: 'Refer to HOD' },
  { value: 'parent_contact', label: 'Contact Parent/Guardian' },
  { value: 'other', label: 'Other' },
];

interface InterventionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerId: string;
  learnerName: string;
  currentRiskScore: number;
}

export function InterventionDialog({
  open,
  onOpenChange,
  learnerId,
  learnerName,
  currentRiskScore,
}: InterventionDialogProps) {
  const [type, setType] = useState<InterventionType | ''>('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);

  const mutation = useCreateIntervention();

  const handleSubmit = () => {
    if (!type) return;

    mutation.mutate(
      {
        learner_id: learnerId,
        intervention_type: type,
        notes: notes || undefined,
        follow_up_date: followUpDate
          ? followUpDate.toISOString().split('T')[0]
          : undefined,
        risk_score_at_time: currentRiskScore,
      },
      {
        onSuccess: () => {
          // Reset form and close
          setType('');
          setNotes('');
          setFollowUpDate(null);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Log Intervention</DialogTitle>
          <DialogDescription>
            Record an intervention for {learnerName} (Risk Score:{' '}
            {currentRiskScore})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="intervention-type">Intervention Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as InterventionType)}
            >
              <SelectTrigger id="intervention-type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {INTERVENTION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="intervention-notes">Notes</Label>
            <Textarea
              id="intervention-notes"
              placeholder="Describe the intervention..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Follow-up Date</Label>
            <DatePicker date={followUpDate} setDate={setFollowUpDate} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!type || mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save Intervention'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
