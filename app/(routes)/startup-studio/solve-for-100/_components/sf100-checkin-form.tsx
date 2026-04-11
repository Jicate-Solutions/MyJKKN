'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSubmitSF100CheckIn } from '@/hooks/startup-studio';

// ── Schemas ──────────────────────────────────────────────────────────────────

const weeklySchema = z.object({
  what_did_you_do: z.string().min(10, 'Please describe what you did (min 10 characters).'),
  blockers: z.string().min(1, 'Please mention blockers, or write "None".'),
  next_steps: z.string().min(10, 'Please describe your next steps (min 10 characters).'),
  wins: z.string().min(1, 'Please share a win, or write "None".'),
  cumulative_paid_users: z.coerce
    .number({ invalid_type_error: 'Must be a number.' })
    .min(0, 'Cannot be negative.')
    .optional(),
  active_paid_users: z.coerce
    .number({ invalid_type_error: 'Must be a number.' })
    .min(0, 'Cannot be negative.')
    .optional(),
  revenue: z.coerce
    .number({ invalid_type_error: 'Must be a number.' })
    .min(0, 'Cannot be negative.')
    .optional(),
});

const microSchema = z.object({
  content: z
    .string()
    .min(1, 'Please write an update.')
    .max(280, 'Micro update must be 280 characters or less.'),
});

type WeeklyFormValues = z.infer<typeof weeklySchema>;
type MicroFormValues = z.infer<typeof microSchema>;

// ── Weekly Form ───────────────────────────────────────────────────────────────

function WeeklyCheckInForm({ enrollmentId }: { enrollmentId: string }) {
  const { mutate: submitCheckIn, isPending } = useSubmitSF100CheckIn(enrollmentId);

  const form = useForm<WeeklyFormValues>({
    resolver: zodResolver(weeklySchema),
    defaultValues: {
      what_did_you_do: '',
      blockers: '',
      next_steps: '',
      wins: '',
      cumulative_paid_users: undefined,
      active_paid_users: undefined,
      revenue: undefined,
    },
  });

  const onSubmit = (values: WeeklyFormValues) => {
    submitCheckIn(
      { ...values, check_in_type: 'weekly' },
      {
        onSuccess: () => {
          toast.success('Weekly check-in submitted!');
          form.reset();
        },
        onError: () => toast.error('Failed to submit check-in. Please try again.'),
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Narrative fields */}
        {[
          {
            name: 'what_did_you_do' as const,
            label: 'What did you do this week?',
            placeholder: 'Describe your key activities and progress...',
          },
          {
            name: 'blockers' as const,
            label: 'Blockers',
            placeholder: 'What is slowing you down? Write "None" if no blockers.',
          },
          {
            name: 'next_steps' as const,
            label: 'Next Steps',
            placeholder: 'What are you doing next week?',
          },
          {
            name: 'wins' as const,
            label: 'Wins',
            placeholder: 'What went well? Write "None" if no wins this week.',
          },
        ].map(({ name, label, placeholder }) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{label}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={placeholder}
                    className="resize-none h-24"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        {/* Metric snapshot */}
        <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
          <p className="text-sm font-medium">Metric Snapshot (optional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="cumulative_paid_users"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Cumulative Paid Users</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active_paid_users"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Active Paid Users</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="revenue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Revenue (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Button type="submit" disabled={isPending || !enrollmentId} className="w-full sm:w-auto">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Submit Weekly Check-in
        </Button>

        {!enrollmentId && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No enrollment ID found. Please navigate here from your dashboard.
            </AlertDescription>
          </Alert>
        )}
      </form>
    </Form>
  );
}

// ── Micro Form ────────────────────────────────────────────────────────────────

function MicroCheckInForm({ enrollmentId }: { enrollmentId: string }) {
  const { mutate: submitCheckIn, isPending } = useSubmitSF100CheckIn(enrollmentId);

  const form = useForm<MicroFormValues>({
    resolver: zodResolver(microSchema),
    defaultValues: { content: '' },
  });

  const content = form.watch('content');
  const charsLeft = 280 - (content?.length ?? 0);

  const onSubmit = (values: MicroFormValues) => {
    submitCheckIn(
      { ...values, check_in_type: 'micro' },
      {
        onSuccess: () => {
          toast.success('Micro update submitted!');
          form.reset();
        },
        onError: () => toast.error('Failed to submit update. Please try again.'),
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quick Update</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="What's happening? Ship something? Hit a blocker? Got a win?"
                  className="resize-none h-32"
                  maxLength={280}
                  {...field}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span
                  className={`text-xs ml-auto tabular-nums ${
                    charsLeft < 20 ? 'text-amber-600' : 'text-muted-foreground'
                  }`}
                >
                  {charsLeft} left
                </span>
              </div>
              <FormDescription>
                Keep it brief — celebrate wins, flag blockers, share momentum.
              </FormDescription>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending || !enrollmentId} className="w-full sm:w-auto">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Post Update
        </Button>
      </form>
    </Form>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

interface SF100CheckInFormProps {
  enrollmentId: string;
}

export function SF100CheckInForm({ enrollmentId }: SF100CheckInFormProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="weekly">
          <TabsList className="mb-6">
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="micro">Micro</TabsTrigger>
          </TabsList>
          <TabsContent value="weekly">
            <WeeklyCheckInForm enrollmentId={enrollmentId} />
          </TabsContent>
          <TabsContent value="micro">
            <MicroCheckInForm enrollmentId={enrollmentId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
