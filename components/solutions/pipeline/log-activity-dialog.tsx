'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useLogProspectActivity } from '@/hooks/solutions/use-prospects';
import type { CommunicationType } from '@/lib/services/solutions/types';

interface LogActivityDialogProps {
  prospectId: string;
  trigger?: React.ReactNode;
}

const ACTIVITY_TYPES: { value: CommunicationType; label: string }[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Other' },
];

export function LogActivityDialog({ prospectId, trigger }: LogActivityDialogProps) {
  const [open, setOpen] = useState(false);
  const [activityType, setActivityType] = useState<CommunicationType>('call');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  const logActivity = useLogProspectActivity();

  const resetForm = () => {
    setActivityType('call');
    setSubject('');
    setSummary('');
    setNextAction('');
    setNextActionDate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!summary.trim()) {
      toast.error('Please enter a summary');
      return;
    }

    try {
      await logActivity.mutateAsync({
        prospect_id: prospectId,
        activity_type: activityType,
        subject: subject.trim() || undefined,
        summary: summary.trim(),
        next_action: nextAction.trim() || undefined,
        next_action_date: nextActionDate || undefined,
      });
      toast.success('Activity logged successfully');
      resetForm();
      setOpen(false);
    } catch {
      toast.error('Failed to log activity');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Log Activity
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log Activity</DialogTitle>
            <DialogDescription>
              Record a communication or interaction with this prospect.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select
                value={activityType}
                onValueChange={(val) => setActivityType(val as CommunicationType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-subject">Subject</Label>
              <Input
                id="activity-subject"
                placeholder="e.g. Follow-up call about proposal"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-summary">
                Summary <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="activity-summary"
                placeholder="What happened during this interaction..."
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="activity-next-action">Next Action</Label>
                <Input
                  id="activity-next-action"
                  placeholder="e.g. Send revised quote"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activity-next-date">Next Action Date</Label>
                <Input
                  id="activity-next-date"
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={logActivity.isPending}>
              {logActivity.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Log Activity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
