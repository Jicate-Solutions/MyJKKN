'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WP_CATEGORIES, InstantHelpResult, SubmitWeeklyPulseDto } from '@/types/work-pulse';
import { submitPulse, getInstantHelp } from '../_actions/pulse-actions';
import { InstantHelpCard } from './instant-help-card';

const pulseSchema = z.object({
  talent_waste_category: z.string().min(1, 'Please select a category'),
  talent_waste_description: z.string().min(10, 'Please write at least 10 characters'),
  repetition_category: z.string().min(1, 'Please select a category'),
  repetition_description: z.string().min(10, 'Please write at least 10 characters'),
});

type PulseFormValues = z.infer<typeof pulseSchema>;

interface WeeklyPulseFormProps {
  hasSubmitted: boolean;
}

export function WeeklyPulseForm({ hasSubmitted: initialSubmitted }: WeeklyPulseFormProps) {
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [submitting, setSubmitting] = useState(false);
  const [helpResult, setHelpResult] = useState<InstantHelpResult | null>(null);

  const form = useForm<PulseFormValues>({
    resolver: zodResolver(pulseSchema),
    defaultValues: {
      talent_waste_category: '',
      talent_waste_description: '',
      repetition_category: '',
      repetition_description: '',
    },
  });

  async function onSubmit(values: PulseFormValues) {
    setSubmitting(true);
    try {
      const result = await submitPulse(values as SubmitWeeklyPulseDto);
      if (!result.success) {
        toast.error(result.error || 'Submission failed');
        return;
      }

      setSubmitted(true);
      toast.success('Weekly Pulse submitted!');

      // Fetch instant help for the primary category
      const helpResponse = await getInstantHelp(values.talent_waste_category);
      if (helpResponse.success && helpResponse.data) {
        setHelpResult(helpResponse.data);
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Pulse submitted for this week
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                You can re-submit to update your response anytime this week.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setSubmitted(false)}
            >
              Update
            </Button>
          </CardContent>
        </Card>
        {helpResult && <InstantHelpCard result={helpResult} />}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Weekly Pulse Check</CardTitle>
        <p className="text-sm text-muted-foreground">
          2 quick questions about your work this week (~2 minutes)
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Q1: Talent Waste */}
          <div className="space-y-3">
            <Label className="text-base font-medium">
              1. What did you spend time on this week that a junior staff member or a computer could have done?
            </Label>
            <p className="text-xs text-muted-foreground">
              Work that didn&apos;t need your skill, training, or judgement.
            </p>
            <Select
              onValueChange={(val) => form.setValue('talent_waste_category', val)}
              value={form.watch('talent_waste_category')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {WP_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.talent_waste_category && (
              <p className="text-sm text-destructive">
                {form.formState.errors.talent_waste_category.message}
              </p>
            )}
            <Textarea
              placeholder="e.g. I spent 4 hours this week copying attendance from the register into Excel for the HOD report"
              {...form.register('talent_waste_description')}
              className="min-h-[80px]"
            />
            {form.formState.errors.talent_waste_description && (
              <p className="text-sm text-destructive">
                {form.formState.errors.talent_waste_description.message}
              </p>
            )}
          </div>

          {/* Q2: Repetitive Work */}
          <div className="space-y-3">
            <Label className="text-base font-medium">
              2. What&apos;s the most repetitive task you do every week that feels like it should be automated?
            </Label>
            <p className="text-xs text-muted-foreground">
              The same steps, every week, on different rows.
            </p>
            <Select
              onValueChange={(val) => form.setValue('repetition_category', val)}
              value={form.watch('repetition_category')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {WP_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.repetition_category && (
              <p className="text-sm text-destructive">
                {form.formState.errors.repetition_category.message}
              </p>
            )}
            <Textarea
              placeholder="e.g. Every Monday I manually check 80 students' fee payment status one by one in Tally"
              {...form.register('repetition_description')}
              className="min-h-[80px]"
            />
            {form.formState.errors.repetition_description && (
              <p className="text-sm text-destructive">
                {form.formState.errors.repetition_description.message}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            {initialSubmitted && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSubmitted(true);
                  form.reset();
                }}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {initialSubmitted ? 'Update Pulse' : 'Submit Pulse'}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
