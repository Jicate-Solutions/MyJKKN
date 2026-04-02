'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useCASETracks } from '@/hooks/vac/use-case';
import type { CASEBatch, CASEBatchStatus, CASEDeliveryFormat } from '@/types/case';

// ── Schema ──────────────────────────────────────────────────────────────

const batchFormSchema = z
  .object({
    track_id: z.string().min(1, 'Track is required'),
    batch_code: z.string().optional(),
    delivery_format: z.enum(['spread', 'moderate', 'intensive']).default('spread'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    max_capacity: z.coerce.number().min(1, 'Capacity must be at least 1').default(30),
    facilitator_id: z.string().optional(),
    status: z.enum(['planned', 'open', 'in_progress', 'completed', 'cancelled']).default('planned'),
  })
  .refine((d) => new Date(d.end_date) > new Date(d.start_date), {
    message: 'End date must be after start date',
    path: ['end_date'],
  });

type BatchFormValues = z.infer<typeof batchFormSchema>;

const DELIVERY_FORMATS: { value: CASEDeliveryFormat; label: string; description: string }[] = [
  { value: 'spread', label: 'Spread', description: '2 hrs/week over full semester' },
  { value: 'moderate', label: 'Moderate', description: '4 hrs/week, ~8 weeks' },
  { value: 'intensive', label: 'Intensive', description: '8 hrs/week, ~4 weeks' },
];

const STATUSES: { value: CASEBatchStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface BatchFormProps {
  batch?: CASEBatch;
  onSubmit: (data: BatchFormValues) => void;
  isSubmitting: boolean;
}

export function BatchForm({ batch, onSubmit, isSubmitting }: BatchFormProps) {
  const { data: tracks, isLoading: tracksLoading } = useCASETracks();

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      track_id: batch?.track_id ?? '',
      batch_code: batch?.batch_code ?? '',
      delivery_format: batch?.delivery_format ?? 'spread',
      start_date: batch?.start_date ? batch.start_date.split('T')[0] : '',
      end_date: batch?.end_date ? batch.end_date.split('T')[0] : '',
      max_capacity: batch?.max_capacity ?? 30,
      facilitator_id: batch?.facilitator_id ?? '',
      status: batch?.status ?? 'planned',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Track & Code ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Batch Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="track_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Track *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={tracksLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={tracksLoading ? 'Loading...' : 'Select track'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(tracks ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.track_code} - {t.track_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="batch_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch Code</FormLabel>
                  <FormControl>
                    <Input placeholder="AI1-2026-B1" {...field} />
                  </FormControl>
                  <FormDescription>Auto-generated if left empty</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Delivery & Schedule ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="delivery_format"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Delivery Format</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DELIVERY_FORMATS.map((df) => (
                        <SelectItem key={df.value} value={df.value}>
                          <span className="font-medium">{df.label}</span>
                          <span className="ml-2 text-muted-foreground text-xs">
                            — {df.description}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Capacity & Status ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity &amp; Status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="max_capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Capacity</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="facilitator_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Facilitator ID</FormLabel>
                  <FormControl>
                    <Input placeholder="User ID of facilitator" {...field} />
                  </FormControl>
                  <FormDescription>UUID of the assigned facilitator</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Actions ────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {batch ? 'Update Batch' : 'Create Batch'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
