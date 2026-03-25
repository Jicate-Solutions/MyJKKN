'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useUpdateEvent } from '@/hooks/startup-studio/use-events';
import type { StartupEvent, EventStatus } from '@/types/startup-studio';

const EVENT_STATUSES: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'registration_open', label: 'Registration Open' },
  { value: 'registration_closed', label: 'Registration Closed' },
  { value: 'build_day', label: 'Build Day' },
  { value: 'demo_day', label: 'Demo Day' },
  { value: 'closed', label: 'Closed' },
];

function toDatetimeLocal(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

const editEventSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  description: z.string().optional(),
  status: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  demo_date: z.string().optional(),
  registration_deadline: z.string().optional(),
  submission_deadline: z.string().optional(),
  metrics_deadline: z.string().optional(),
  team_max_size: z.coerce.number().min(1).max(20).optional(),
});

type FormValues = z.infer<typeof editEventSchema>;

interface EditEventDialogProps {
  event: StartupEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEventDialog({ event, open, onOpenChange }: EditEventDialogProps) {
  const updateEvent = useUpdateEvent();

  const form = useForm<FormValues>({
    resolver: zodResolver(editEventSchema),
    defaultValues: {
      name: event.name,
      description: event.description || '',
      status: event.status,
      start_date: toDatetimeLocal(event.start_date),
      end_date: toDatetimeLocal(event.end_date),
      demo_date: toDatetimeLocal(event.demo_date),
      registration_deadline: toDatetimeLocal(event.registration_deadline),
      submission_deadline: toDatetimeLocal(event.submission_deadline),
      metrics_deadline: toDatetimeLocal(event.metrics_deadline),
      team_max_size: event.config?.team_max_size || 5,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: event.name,
        description: event.description || '',
        status: event.status,
        start_date: toDatetimeLocal(event.start_date),
        end_date: toDatetimeLocal(event.end_date),
        demo_date: toDatetimeLocal(event.demo_date),
        registration_deadline: toDatetimeLocal(event.registration_deadline),
        submission_deadline: toDatetimeLocal(event.submission_deadline),
        metrics_deadline: toDatetimeLocal(event.metrics_deadline),
        team_max_size: event.config?.team_max_size || 5,
      });
    }
  }, [open, event, form]);

  const onSubmit = (values: FormValues) => {
    updateEvent.mutate(
      {
        id: event.id,
        dto: {
          name: values.name,
          description: values.description || undefined,
          status: values.status as EventStatus,
          start_date: values.start_date ? new Date(values.start_date).toISOString() : undefined,
          end_date: values.end_date ? new Date(values.end_date).toISOString() : undefined,
          demo_date: values.demo_date ? new Date(values.demo_date).toISOString() : undefined,
          registration_deadline: values.registration_deadline ? new Date(values.registration_deadline).toISOString() : undefined,
          submission_deadline: values.submission_deadline ? new Date(values.submission_deadline).toISOString() : undefined,
          metrics_deadline: values.metrics_deadline ? new Date(values.metrics_deadline).toISOString() : undefined,
          config: {
            ...event.config,
            team_max_size: values.team_max_size || 5,
          },
        },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Event Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. JKKN Appathon 3.0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Brief description of the event" rows={2} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EVENT_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="team_max_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Team Size</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={20} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Dates */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Dates & Deadlines</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="registration_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Deadline</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Build Day (Start)</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="demo_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Demo Day</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event End Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="submission_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Submission Deadline</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="metrics_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metrics Deadline</FormLabel>
                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateEvent.isPending}>
                {updateEvent.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
