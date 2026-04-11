'use client';

/**
 * SF100InterviewForm — Log a customer interview
 *
 * Usage:
 *   <SF100InterviewForm enrollmentId="abc-123" />
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Loader2 } from 'lucide-react';
import { useLogSF100Interview } from '@/hooks/startup-studio';

interface SF100InterviewFormProps {
  enrollmentId: string;
  /** Custom trigger label */
  triggerLabel?: string;
}

interface InterviewFormState {
  customer_name: string;
  customer_role: string;
  key_quote: string;
  pain_level: number;
  willingness_to_pay: boolean;
  follow_up_needed: boolean;
}

const EMPTY: InterviewFormState = {
  customer_name: '',
  customer_role: '',
  key_quote: '',
  pain_level: 5,
  willingness_to_pay: false,
  follow_up_needed: false,
};

export function SF100InterviewForm({
  enrollmentId,
  triggerLabel = 'Log Interview',
}: SF100InterviewFormProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InterviewFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useLogSF100Interview(enrollmentId);

  function handleChange(field: keyof InterviewFormState, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name.trim()) {
      setError('Customer name is required.');
      return;
    }

    mutate(
      {
        customer_name: form.customer_name.trim(),
        customer_role: form.customer_role.trim() || undefined,
        key_quote: form.key_quote.trim() || undefined,
        pain_level: form.pain_level,
        willingness_to_pay: form.willingness_to_pay,
        follow_up_needed: form.follow_up_needed,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm(EMPTY);
          setError(null);
        },
        onError: () => {
          setError('Failed to save interview. Please try again.');
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

  const painColor =
    form.pain_level >= 8
      ? 'text-red-600'
      : form.pain_level >= 5
        ? 'text-amber-600'
        : 'text-green-600';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Log customer interview">
          <Mic className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" aria-describedby="interview-form-desc">
        <DialogHeader>
          <DialogTitle>Log Customer Interview</DialogTitle>
          <DialogDescription id="interview-form-desc">
            Record key insights from a customer conversation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2" noValidate>
          {/* Customer name */}
          <div className="space-y-1.5">
            <Label htmlFor="customer_name">
              Customer Name <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="customer_name"
              value={form.customer_name}
              onChange={(e) => handleChange('customer_name', e.target.value)}
              placeholder="e.g. Priya Sharma"
              required
              aria-required="true"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>

          {/* Customer role */}
          <div className="space-y-1.5">
            <Label htmlFor="customer_role">Role / Title</Label>
            <Input
              id="customer_role"
              value={form.customer_role}
              onChange={(e) => handleChange('customer_role', e.target.value)}
              placeholder="e.g. Pharmacy Student, Hospital Manager"
            />
          </div>

          {/* Key quote */}
          <div className="space-y-1.5">
            <Label htmlFor="key_quote">Key Quote</Label>
            <Textarea
              id="key_quote"
              value={form.key_quote}
              onChange={(e) => handleChange('key_quote', e.target.value)}
              placeholder="Most insightful thing they said..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Pain level slider */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>Pain Level</Label>
              <span className={`text-sm font-bold tabular-nums ${painColor}`}>
                {form.pain_level} / 10
              </span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[form.pain_level]}
              onValueChange={([v]) => handleChange('pain_level', v)}
              aria-label="Pain level from 1 to 10"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 — Minor annoyance</span>
              <span>10 — Unbearable</span>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="willingness_to_pay"
                checked={form.willingness_to_pay}
                onCheckedChange={(checked) =>
                  handleChange('willingness_to_pay', checked === true)
                }
              />
              <Label htmlFor="willingness_to_pay" className="cursor-pointer font-normal">
                Willing to pay for a solution
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="follow_up_needed"
                checked={form.follow_up_needed}
                onCheckedChange={(checked) =>
                  handleChange('follow_up_needed', checked === true)
                }
              />
              <Label htmlFor="follow_up_needed" className="cursor-pointer font-normal">
                Follow-up needed
              </Label>
            </div>
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
              {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />}
              Save Interview
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
