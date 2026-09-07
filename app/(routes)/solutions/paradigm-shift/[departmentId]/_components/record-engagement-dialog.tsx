'use client';

/**
 * The form that finally makes sh_community_engagements writable.
 *
 * The SDGs are checkboxes, not a Select: `sdg_goals` is a multi-value column,
 * and Radix Select is single-value with a documented empty-string footgun
 * (scripts/ci/check-radix-select-empty-values.sh). The one Select on this form —
 * the optional solution link — uses an explicit sentinel for "none" rather than
 * the empty string for the same reason.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  useDepartmentSolutionOptions,
  useRecordCommunityEngagement,
} from '@/hooks/solutions/use-community-engagements';
import { SDG_GOALS } from '@/lib/services/solutions/societal-service';

/** Radix Select rejects value=""; this is the "no solution linked" option. */
const NO_SOLUTION = '__none__';

interface RecordEngagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  institutionId: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecordEngagementDialog({
  open,
  onOpenChange,
  departmentId,
  institutionId,
}: RecordEngagementDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [engagementDate, setEngagementDate] = useState(todayISO);
  const [hours, setHours] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [solutionId, setSolutionId] = useState<string>(NO_SOLUTION);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: solutionOptions = [] } = useDepartmentSolutionOptions(departmentId, open);
  const record = useRecordCommunityEngagement();

  const reset = () => {
    setTitle('');
    setDescription('');
    setEngagementDate(todayISO());
    setHours('');
    setBeneficiaries('');
    setGoals([]);
    setSolutionId(NO_SOLUTION);
    setFormError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleGoal = (code: string, checked: boolean) => {
    setGoals((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)));
  };

  const handleSubmit = async () => {
    setFormError(null);

    const hoursValue = hours.trim() === '' ? 0 : Number(hours);
    const beneficiariesValue = beneficiaries.trim() === '' ? 0 : Number(beneficiaries);

    if (!title.trim()) {
      setFormError('Give the engagement a title.');
      return;
    }
    if (!engagementDate) {
      setFormError('Give the engagement a date.');
      return;
    }
    if (!Number.isFinite(hoursValue) || hoursValue < 0) {
      setFormError('Hours spent must be a number and cannot be negative.');
      return;
    }
    if (!Number.isInteger(beneficiariesValue) || beneficiariesValue < 0) {
      setFormError('People reached must be a whole number and cannot be negative.');
      return;
    }

    try {
      await record.mutateAsync({
        department_id: departmentId,
        institution_id: institutionId,
        solution_id: solutionId === NO_SOLUTION ? null : solutionId,
        title,
        description,
        engagement_date: engagementDate,
        hours_spent: hoursValue,
        beneficiaries_count: beneficiariesValue,
        sdg_goals: goals,
      });
      toast.success('Recorded. It now waits for a head of department to approve it.');
      close(false);
    } catch (err: unknown) {
      // Rule 27: the database's refusal is shown, never swallowed into a
      // closed dialog that looks like it saved.
      setFormError(err instanceof Error ? err.message : 'The engagement could not be recorded.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a community engagement</DialogTitle>
          <DialogDescription>
            Work this department did for the community that produced no invoice. It is saved as
            waiting for approval — a head of department approves it, and only then does it count
            towards the department&apos;s activity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="engagement-title">What was done</Label>
            <Input
              id="engagement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Free eye-screening camp at Kumarapalayam"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-description">Details (optional)</Label>
            <Textarea
              id="engagement-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who took part, where it happened, what came of it."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="engagement-date">Date</Label>
              <Input
                id="engagement-date"
                type="date"
                value={engagementDate}
                onChange={(e) => setEngagementDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engagement-hours">Hours spent</Label>
              <Input
                id="engagement-hours"
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engagement-beneficiaries">People reached</Label>
              <Input
                id="engagement-beneficiaries"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={beneficiaries}
                onChange={(e) => setBeneficiaries(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-solution">Linked solution (optional)</Label>
            <Select value={solutionId} onValueChange={setSolutionId}>
              <SelectTrigger id="engagement-solution">
                <SelectValue placeholder="Not linked to a solution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SOLUTION}>Not linked to a solution</SelectItem>
                {solutionOptions.map((solution) => (
                  <SelectItem key={solution.id} value={solution.id}>
                    {solution.solution_code ? `${solution.solution_code} — ` : ''}
                    {solution.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Most community work has no solution behind it. Leave this alone if that is the case.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Sustainable Development Goals addressed (optional)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-md border border-border p-3">
              {SDG_GOALS.map((goal) => {
                const checked = goals.includes(goal.code);
                return (
                  <label
                    key={goal.code}
                    htmlFor={`sdg-${goal.code}`}
                    className="flex items-start gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-muted"
                  >
                    <Checkbox
                      id={`sdg-${goal.code}`}
                      checked={checked}
                      onCheckedChange={(value) => toggleGoal(goal.code, value === true)}
                      className="mt-0.5"
                    />
                    <span className="text-foreground">
                      <span className="font-medium">SDG {goal.number}</span>{' '}
                      <span className="text-muted-foreground">{goal.title}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={record.isPending}>
            {record.isPending ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
