'use client';

/**
 * Link Meeting Dialog — manual-entry form for linking a meeting to a project.
 *
 * Captures: source (dropdown — fireflies | zoom | google_meet | teams | other),
 * title, date, transcript URL. Actual Fireflies API fetch is deferred — user
 * pastes the transcript URL manually for now.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F12.
 */

import { useState } from 'react';
import { toast } from 'sonner';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreateMeeting } from '@/hooks/projects/use-meetings';

const MEETING_SOURCES = [
  { value: 'fireflies', label: 'Fireflies' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'other', label: 'Other' },
];

interface LinkMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface FormState {
  meeting_source: string;
  meeting_title: string;
  meeting_date: string;
  transcript_url: string;
}

const EMPTY: FormState = {
  meeting_source: 'fireflies',
  meeting_title: '',
  meeting_date: '',
  transcript_url: '',
};

export function LinkMeetingDialog({
  open,
  onOpenChange,
  projectId,
}: LinkMeetingDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const createMeeting = useCreateMeeting();

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    setForm(EMPTY);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.meeting_source) {
      toast.error('Please select a meeting source.');
      return;
    }

    createMeeting.mutate(
      {
        project_id: projectId,
        meeting_source: form.meeting_source,
        meeting_title: form.meeting_title.trim() || null,
        meeting_date: form.meeting_date || null,
        transcript_url: form.transcript_url.trim() || null,
        suggested_tasks: [],
      },
      {
        onSuccess: () => {
          toast.success('Meeting linked successfully.');
          handleClose();
        },
        onError: (err) => {
          toast.error(`Failed to link meeting: ${(err as Error).message}`);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a meeting</DialogTitle>
          <DialogDescription>
            Record meeting metadata and an optional transcript URL. Fireflies API
            fetch and AI action-item extraction are coming in a future update.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Source */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting_source">Source</Label>
            <Select
              value={form.meeting_source}
              onValueChange={(v) => handleChange('meeting_source', v)}
            >
              <SelectTrigger id="meeting_source">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {MEETING_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting_title">Title</Label>
            <Input
              id="meeting_title"
              placeholder="e.g. Weekly project sync"
              value={form.meeting_title}
              onChange={(e) => handleChange('meeting_title', e.target.value)}
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting_date">Date</Label>
            <Input
              id="meeting_date"
              type="date"
              value={form.meeting_date}
              onChange={(e) => handleChange('meeting_date', e.target.value)}
            />
          </div>

          {/* Transcript URL */}
          <div className="space-y-1.5">
            <Label htmlFor="transcript_url">Transcript URL (optional)</Label>
            <Input
              id="transcript_url"
              type="url"
              placeholder="https://app.fireflies.ai/view/…"
              value={form.transcript_url}
              onChange={(e) => handleChange('transcript_url', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste the Fireflies (or other tool) link to the transcript.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMeeting.isPending}>
              {createMeeting.isPending ? 'Linking…' : 'Link meeting'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
