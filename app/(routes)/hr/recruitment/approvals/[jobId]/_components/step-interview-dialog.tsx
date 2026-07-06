'use client';

/**
 * Schedule / reschedule the interview for a candidate's CURRENT approval step.
 * Server stamps the sitting onto the chain step (schedule-step-interview API);
 * a live 'scheduled' sitting is rescheduled (new row, audit link) instead of
 * being edited in place.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useScheduleStepInterview } from '@/hooks/hr/use-recruitment';
import {
  INTERVIEW_MODE_LABELS,
  type HRRecruitmentCandidate,
  type InterviewMode,
} from '@/types/hr-recruitment';

const MODES: InterviewMode[] = ['in_person', 'phone', 'video', 'walk_in'];

export function StepInterviewDialog({
  open, onOpenChange, candidate, isReschedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: HRRecruitmentCandidate;
  isReschedule: boolean;
}) {
  const schedule = useScheduleStepInterview();
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('30');
  const [mode, setMode] = useState<InterviewMode>('in_person');
  const [locationOrLink, setLocationOrLink] = useState('');

  const stepNo = candidate.current_step + 1;
  const stepRole = candidate.approval_chain?.[candidate.current_step]?.approver_role ?? '';

  const submit = () => {
    if (!scheduledAt) return;
    schedule.mutate(
      {
        candidate_id: candidate.id,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: parseInt(duration) || 30,
        mode,
        location_or_link: locationOrLink.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(isReschedule ? 'Interview rescheduled' : 'Interview scheduled');
          onOpenChange(false);
          setScheduledAt('');
          setLocationOrLink('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReschedule ? 'Reschedule Interview' : 'Schedule Interview'} — {candidate.name}
          </DialogTitle>
          <DialogDescription>
            Round {stepNo} ({stepRole}). You are added to the interview panel automatically;
            the step can be marked reviewed once this interview is completed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="siScheduledAt">Date &amp; time <span className="text-destructive">*</span></Label>
            <Input
              id="siScheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="siDuration">Duration (minutes)</Label>
            <Input
              id="siDuration"
              type="number"
              min={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as InterviewMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m} value={m}>{INTERVIEW_MODE_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="siLocation">
              {mode === 'video' ? 'Meeting link' : 'Location'} (optional)
            </Label>
            <Input
              id="siLocation"
              value={locationOrLink}
              onChange={(e) => setLocationOrLink(e.target.value)}
              placeholder={mode === 'video' ? 'https://meet…' : 'Room / venue'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!scheduledAt || schedule.isPending} onClick={submit}>
            {schedule.isPending
              ? 'Saving…'
              : isReschedule ? 'Confirm Reschedule' : 'Confirm Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
