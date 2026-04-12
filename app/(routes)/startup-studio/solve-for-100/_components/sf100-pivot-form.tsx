'use client';

/**
 * SF100PivotForm — Log a strategic pivot
 *
 * Usage:
 *   <SF100PivotForm enrollmentId="abc-123" />
 *
 * Renders as a Dialog trigger button. Self-contained form state.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GitBranch, Loader2 } from 'lucide-react';
import { useLogSF100Pivot } from '@/hooks/startup-studio';

interface SF100PivotFormProps {
  enrollmentId: string;
  /** Custom trigger label */
  triggerLabel?: string;
}

type PivotType = 'customer_segment' | 'pricing' | 'solution' | 'channel' | 'problem' | 'full';

interface PivotFormState {
  pivot_type: PivotType | '';
  before_description: string;
  after_description: string;
  reasoning: string;
  evidence: string;
}

const EMPTY: PivotFormState = {
  pivot_type: '',
  before_description: '',
  after_description: '',
  reasoning: '',
  evidence: '',
};

const PIVOT_TYPES: { value: PivotType; label: string; description: string }[] = [
  { value: 'customer_segment', label: 'Customer Segment', description: 'Targeting a different type of customer' },
  { value: 'pricing', label: 'Pricing', description: 'Changing how you charge or how much' },
  { value: 'solution', label: 'Solution', description: 'Different approach to solving the same problem' },
  { value: 'channel', label: 'Channel', description: 'Changing how you reach customers' },
  { value: 'problem', label: 'Problem', description: 'Solving a different problem for the same customers' },
  { value: 'full', label: 'Full Pivot', description: 'Major direction change — new problem, customer, or solution' },
];

export function SF100PivotForm({
  enrollmentId,
  triggerLabel = 'Log Pivot',
}: SF100PivotFormProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PivotFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useLogSF100Pivot(enrollmentId);

  function handleChange(field: keyof PivotFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.pivot_type) {
      setError('Please select a pivot type.');
      return;
    }
    if (!form.before_description.trim()) {
      setError('Please describe what you had before the pivot.');
      return;
    }
    if (!form.after_description.trim()) {
      setError('Please describe what you are pivoting to.');
      return;
    }

    mutate(
      {
        pivot_type: form.pivot_type,
        before_description: form.before_description.trim(),
        after_description: form.after_description.trim(),
        reasoning: form.reasoning.trim() || undefined,
        evidence: form.evidence.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm(EMPTY);
          setError(null);
        },
        onError: () => {
          setError('Failed to save pivot. Please try again.');
        },
      },
    );
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(EMPTY);
      setError(null);
    }
    setOpen(next);
  }

  const selectedPivotMeta = PIVOT_TYPES.find((p) => p.value === form.pivot_type);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Log a pivot">
          <GitBranch className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg" aria-describedby="pivot-form-desc">
        <DialogHeader>
          <DialogTitle>Log Pivot</DialogTitle>
          <DialogDescription id="pivot-form-desc">
            Record a strategic direction change and the evidence behind it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2" noValidate>
          {/* Pivot type */}
          <div className="space-y-1.5">
            <Label htmlFor="pivot_type">
              Pivot Type <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Select
              value={form.pivot_type}
              onValueChange={(v) => handleChange('pivot_type', v)}
            >
              <SelectTrigger id="pivot_type" aria-required="true">
                <SelectValue placeholder="Select pivot type..." />
              </SelectTrigger>
              <SelectContent>
                {PIVOT_TYPES.map(({ value, label, description }) => (
                  <SelectItem key={value} value={value}>
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPivotMeta && (
              <p className="text-xs text-muted-foreground">{selectedPivotMeta.description}</p>
            )}
          </div>

          {/* Before description */}
          <div className="space-y-1.5">
            <Label htmlFor="before_description">
              Before <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="before_description"
              value={form.before_description}
              onChange={(e) => handleChange('before_description', e.target.value)}
              placeholder="What was your original approach / assumption / target?"
              rows={3}
              className="resize-none"
              required
              aria-required="true"
            />
          </div>

          {/* After description */}
          <div className="space-y-1.5">
            <Label htmlFor="after_description">
              After <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="after_description"
              value={form.after_description}
              onChange={(e) => handleChange('after_description', e.target.value)}
              placeholder="What are you pivoting to?"
              rows={3}
              className="resize-none"
              required
              aria-required="true"
            />
          </div>

          {/* Reasoning */}
          <div className="space-y-1.5">
            <Label htmlFor="reasoning">Reasoning</Label>
            <Textarea
              id="reasoning"
              value={form.reasoning}
              onChange={(e) => handleChange('reasoning', e.target.value)}
              placeholder="Why are you making this change?"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Evidence */}
          <div className="space-y-1.5">
            <Label htmlFor="evidence">Evidence</Label>
            <Textarea
              id="evidence"
              value={form.evidence}
              onChange={(e) => handleChange('evidence', e.target.value)}
              placeholder="What data, customer feedback, or insight prompted this pivot?"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
              )}
              Save Pivot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
