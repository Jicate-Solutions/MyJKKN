'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useScheduleInterview } from '@/hooks/hr/use-recruitment-interviews';
import { useCandidates, useJobs } from '@/hooks/hr/use-recruitment';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import { useAuth } from '@/hooks/use-auth';
import {
  INTERVIEW_MODE_LABELS,
  type InterviewMode,
} from '@/types/hr-recruitment';
import { toast } from 'sonner';

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill candidate when scheduling from a candidate detail page */
  defaultCandidateId?: string;
  /** Pre-fill job when scheduling from a job detail page */
  defaultJobId?: string;
}

const MODES: InterviewMode[] = ['in_person', 'phone', 'video', 'walk_in'];

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  defaultCandidateId,
  defaultJobId,
}: ScheduleInterviewDialogProps) {
  const { profile } = useAuth();
  const schedule = useScheduleInterview();

  // Form state
  const [candidateId, setCandidateId] = useState(defaultCandidateId ?? '');
  const [jobId, setJobId] = useState(defaultJobId ?? '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [mode, setMode] = useState<InterviewMode>('in_person');
  const [locationOrLink, setLocationOrLink] = useState('');
  const [roundName, setRoundName] = useState('');
  const [roundNumber, setRoundNumber] = useState('1');
  const [panelMemberIds, setPanelMemberIds] = useState<string[]>([]);

  // Dropdowns data
  const { data: candidatesData } = useCandidates({ pageSize: 200 });
  const candidates = candidatesData?.data ?? [];

  const { data: jobsData } = useJobs({ status: 'open', pageSize: 200 });
  const jobs = jobsData?.data ?? [];

  // Staff for panel member selection — use institution_id from profile
  const institutionId = profile?.institution_id ?? '';
  const { data: staffList = [] } = useStaffForSelection({
    institution_id: institutionId,
    isActive: true,
  });

  const canSubmit =
    candidateId !== '' &&
    scheduledAt !== '' &&
    panelMemberIds.length > 0 &&
    !schedule.isPending;

  const resetForm = () => {
    setCandidateId(defaultCandidateId ?? '');
    setJobId(defaultJobId ?? '');
    setScheduledAt('');
    setDurationMinutes('60');
    setMode('in_person');
    setLocationOrLink('');
    setRoundName('');
    setRoundNumber('1');
    setPanelMemberIds([]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await schedule.mutateAsync({
        candidate_id: candidateId,
        job_id: jobId || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: parseInt(durationMinutes, 10) || 60,
        mode,
        location_or_link: locationOrLink.trim() || null,
        round_name: roundName.trim() || null,
        round_number: parseInt(roundNumber, 10) || 1,
        panel_member_ids: panelMemberIds,
      });
      toast.success('Interview scheduled');
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const togglePanelMember = (id: string) => {
    setPanelMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Candidate */}
          <div className="space-y-1.5">
            <Label htmlFor="si-candidate">Candidate *</Label>
            <select
              id="si-candidate"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select candidate...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.role_title}
                </option>
              ))}
            </select>
          </div>

          {/* Job (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="si-job">Job Posting</Label>
            <select
              id="si-job"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">None (unlinked)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          {/* Date/Time */}
          <div className="space-y-1.5">
            <Label htmlFor="si-datetime">Date &amp; Time *</Label>
            <Input
              id="si-datetime"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label htmlFor="si-duration">Duration (minutes)</Label>
            <Input
              id="si-duration"
              type="number"
              min={15}
              max={480}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label>Mode *</Label>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    mode === m
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-input hover:bg-muted'
                  }`}
                >
                  {INTERVIEW_MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Location / Link */}
          <div className="space-y-1.5">
            <Label htmlFor="si-location">
              {mode === 'video' ? 'Video Link' : mode === 'phone' ? 'Phone Number' : 'Location'}
            </Label>
            <Input
              id="si-location"
              placeholder={
                mode === 'video'
                  ? 'https://meet.google.com/...'
                  : mode === 'phone'
                  ? '+91 ...'
                  : 'Building, Room number'
              }
              value={locationOrLink}
              onChange={(e) => setLocationOrLink(e.target.value)}
            />
          </div>

          {/* Round */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="si-round-num">Round #</Label>
              <Input
                id="si-round-num"
                type="number"
                min={1}
                value={roundNumber}
                onChange={(e) => setRoundNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="si-round-name">Round Name</Label>
              <Input
                id="si-round-name"
                placeholder="e.g. Technical, HR"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
              />
            </div>
          </div>

          {/* Panel Members */}
          <div className="space-y-1.5">
            <Label>Panel Members * ({panelMemberIds.length} selected)</Label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-input p-2 space-y-1">
              {staffList.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No staff found for this institution
                </p>
              )}
              {staffList.map((s) => {
                const selected = panelMemberIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => togglePanelMember(s.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      selected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    {s.first_name} {s.last_name}
                    <span className="text-xs text-muted-foreground ml-2">{s.staff_id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
