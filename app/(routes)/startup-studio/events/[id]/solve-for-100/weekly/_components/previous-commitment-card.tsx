'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { History } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

interface Props {
  previousCommitment: string;
  previousWeek: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  disabled?: boolean;
}

/**
 * Shows last week's commitment and asks the team whether they met it,
 * plus what actually happened. These answers are recorded AGAINST
 * the previous week's check-in (not the new one).
 */
export function PreviousCommitmentCard({
  previousCommitment,
  previousWeek,
  form,
  disabled = false,
}: Props) {
  return (
    <Card className="border-orange-300 bg-orange-50/60 dark:bg-orange-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-orange-600" />
          Week {previousWeek} Result
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            Accountability
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Last week you committed to:
          </p>
          <p className="text-sm font-medium leading-relaxed">&ldquo;{previousCommitment}&rdquo;</p>
        </div>

        <FormField
          control={form.control}
          name="commitment_met"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel>
                Did you meet it? <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={disabled}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 flex-1">
                    <RadioGroupItem value="yes" id="met-yes" />
                    <span className="text-sm font-medium">Yes — delivered</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 flex-1">
                    <RadioGroupItem value="partial" id="met-partial" />
                    <span className="text-sm font-medium">Partial</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 flex-1">
                    <RadioGroupItem value="no" id="met-no" />
                    <span className="text-sm font-medium">No — missed</span>
                  </label>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="commitment_result"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                What actually happened? <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  disabled={disabled}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g., Talked to 2 out of 3 clinic owners. One agreed to a trial, one said they already use something similar."
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">
                  {(field.value ?? '').length}/500
                </span>
              </div>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
