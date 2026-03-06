'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useCreateEvent } from '@/hooks/startup-studio/use-events';

const createEventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  demo_date: z.string().optional(),
  registration_deadline: z.string().optional(),
  submission_deadline: z.string().optional(),
  metrics_deadline: z.string().optional(),
  team_max_size: z.coerce.number().min(1).max(20).default(5),
});

type FormValues = z.infer<typeof createEventSchema>;

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function CreateEventDialog({ open, onOpenChange, userId }: CreateEventDialogProps) {
  const createEvent = useCreateEvent();

  const form = useForm<FormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      demo_date: '',
      registration_deadline: '',
      submission_deadline: '',
      metrics_deadline: '',
      team_max_size: 5,
    },
  });

  const onSubmit = (values: FormValues) => {
    createEvent.mutate(
      {
        dto: {
          name: values.name,
          description: values.description || undefined,
          start_date: values.start_date || undefined,
          end_date: values.end_date || undefined,
          demo_date: values.demo_date || undefined,
          registration_deadline: values.registration_deadline || undefined,
          submission_deadline: values.submission_deadline || undefined,
          metrics_deadline: values.metrics_deadline || undefined,
          config: { team_max_size: values.team_max_size },
        },
        userId,
      },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Event Name *</FormLabel>
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

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Dates & Deadlines</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="registration_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Deadline</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Build Day (Start)</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="demo_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Demo Day</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event End Date</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="submission_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Submission Deadline</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="metrics_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metrics Deadline</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  'Create Event'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
