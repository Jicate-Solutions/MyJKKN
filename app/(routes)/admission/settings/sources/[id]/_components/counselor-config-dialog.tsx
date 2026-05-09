'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

import {
  CounselorSourceService,
  type CounselorSourceAssignment,
} from '@/lib/services/admission/counselor-source-service';

const schema = z
  .object({
    priority_weight: z.coerce.number().min(0).max(10),
    max_leads_per_day: z
      .union([z.coerce.number().int().positive(), z.literal('').transform(() => null), z.null()])
      .nullable(),
    effective_from: z.string().nullable().optional(),
    effective_to: z.string().nullable().optional(),
    is_paused: z.boolean(),
  })
  .refine(
    (d) =>
      !d.effective_from ||
      !d.effective_to ||
      new Date(d.effective_from) < new Date(d.effective_to),
    { message: 'Start must be before end', path: ['effective_to'] }
  );

type FormValues = z.infer<typeof schema>;

interface CounselorConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  assignment: CounselorSourceAssignment | null;
}

const toDateInput = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : '';

export function CounselorConfigDialog({
  open,
  onOpenChange,
  sourceId,
  assignment,
}: CounselorConfigDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority_weight: 1.0,
      max_leads_per_day: null,
      effective_from: '',
      effective_to: '',
      is_paused: false,
    },
  });

  useEffect(() => {
    if (open && assignment) {
      form.reset({
        priority_weight: Number(assignment.priority_weight ?? 1),
        max_leads_per_day: assignment.max_leads_per_day ?? null,
        effective_from: toDateInput(assignment.effective_from),
        effective_to: toDateInput(assignment.effective_to),
        is_paused: assignment.is_paused ?? false,
      });
    }
  }, [open, assignment, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      if (!assignment) return;
      return CounselorSourceService.update(assignment.id, {
        priority_weight: v.priority_weight,
        max_leads_per_day:
          v.max_leads_per_day === null || v.max_leads_per_day === undefined
            ? null
            : Number(v.max_leads_per_day),
        effective_from: v.effective_from || null,
        effective_to: v.effective_to || null,
        is_paused: v.is_paused,
      });
    },
    onSuccess: () => {
      toast.success('Assignment updated');
      queryClient.invalidateQueries({
        queryKey: ['counselor-source-assignments', sourceId],
      });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update assignment'),
  });

  if (!assignment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription>
            Configure date window, daily cap, weight, and pause for{' '}
            <span className="font-medium">
              {assignment.counselor?.name ?? 'this counselor'}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="priority_weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority weight</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">0–10, default 1.0</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_leads_per_day"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Daily cap</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="No cap"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === '' ? null : Number(e.target.value)
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Max leads/day from this source
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="effective_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective from</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="effective_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective to</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_paused"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border px-3 py-2">
                  <div className="space-y-0.5">
                    <FormLabel>Paused</FormLabel>
                    <FormDescription className="text-xs">
                      Counselor stays mapped but auto-assignment skips them
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
