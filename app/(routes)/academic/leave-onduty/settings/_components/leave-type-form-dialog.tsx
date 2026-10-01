'use client';

// Learner leave type create/edit dialog.
// Copied/adapted from campus-living's hostel leave type form dialog — extended
// with category, residency, sponsor approval, and half-day/period-wise flags.

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useSaveLearnerLeaveType } from '@/hooks/learners/use-learner-leave-types';
import type { LearnerLeaveType } from '@/types/learner-leave-types';

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#22C55E', // green
  '#F97316', // orange
  '#EF4444', // red
  '#8B5CF6', // purple
  '#F59E0B', // amber
  '#6366F1', // indigo
  '#6B7280', // gray
];

const formSchema = z.object({
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(40, 'Code must be at most 40 characters')
    .regex(/^[a-z0-9_]+$/, 'Code must be lowercase letters, numbers, and underscores only'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  description: z.string().max(500).optional(),
  color_code: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
  category: z.enum(['leave', 'onduty']),
  residency: z.enum(['hostel', 'day_scholar', 'both']),
  max_duration_days: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), 'Must be a positive integer or blank')
    .nullable(),
  advance_notice_hours: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0, 'Must be a non-negative integer'),
  requires_attachment: z.boolean(),
  allow_half_day: z.boolean(),
  allow_periodwise: z.boolean(),
  requires_sponsor_approval: z.boolean(),
  sponsor_role_hint: z.string().max(100).optional(),
  affects_attendance: z.boolean(),
  is_active: z.boolean(),
  sort_order: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)))
    .refine((v) => Number.isFinite(v) && v >= 0, 'Must be a non-negative integer'),
});

type FormValues = z.input<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  code: '',
  name: '',
  description: '',
  color_code: PRESET_COLORS[0],
  category: 'leave',
  residency: 'both',
  max_duration_days: null,
  advance_notice_hours: 0,
  requires_attachment: false,
  allow_half_day: true,
  allow_periodwise: false,
  requires_sponsor_approval: false,
  sponsor_role_hint: '',
  affects_attendance: true,
  is_active: true,
  sort_order: 0,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

interface LeaveTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  leaveType?: LearnerLeaveType;
}

export function LeaveTypeFormDialog({ open, onOpenChange, mode, leaveType }: LeaveTypeFormDialogProps) {
  const { profile } = useAuth();
  const saveType = useSaveLearnerLeaveType();
  // Tracks whether the user has typed into Code directly, so the name->code
  // auto-suggest (create mode only) stops once they take over.
  const codeTouched = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    codeTouched.current = mode === 'edit';
    if (mode === 'edit' && leaveType) {
      form.reset({
        code: leaveType.code,
        name: leaveType.name,
        description: leaveType.description ?? '',
        color_code: leaveType.color_code,
        category: leaveType.category,
        residency: leaveType.residency,
        max_duration_days: leaveType.max_duration_days,
        advance_notice_hours: leaveType.advance_notice_hours,
        requires_attachment: leaveType.requires_attachment,
        allow_half_day: leaveType.allow_half_day,
        allow_periodwise: leaveType.allow_periodwise,
        requires_sponsor_approval: leaveType.requires_sponsor_approval,
        sponsor_role_hint: leaveType.sponsor_role_hint ?? '',
        affects_attendance: leaveType.affects_attendance,
        is_active: leaveType.is_active,
        sort_order: leaveType.sort_order,
      });
    } else {
      form.reset(DEFAULT_VALUES);
    }
  }, [open, mode, leaveType, form]);

  const requiresSponsor = form.watch('requires_sponsor_approval');
  const nameValue = form.watch('name');

  useEffect(() => {
    if (mode !== 'create' || codeTouched.current) return;
    form.setValue('code', slugify(nameValue || ''), { shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameValue, mode]);

  const onSubmit = (values: z.output<typeof formSchema>) => {
    if (!profile?.id) return;
    saveType.mutate(
      {
        id: mode === 'edit' ? leaveType?.id : undefined,
        input: {
          ...values,
          description: values.description || null,
          sponsor_role_hint: values.requires_sponsor_approval ? values.sponsor_role_hint || null : null,
        },
        userId: profile.id,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] p-0">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle>{mode === 'create' ? 'Create Leave Type' : 'Edit Leave Type'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new leave/on-duty type. It applies to every learner across the group.'
              : 'Update the leave type. The code cannot be changed once created.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] px-4 sm:px-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Medical Leave" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., medical"
                          {...field}
                          disabled={mode === 'edit'}
                          onChange={(e) => {
                            codeTouched.current = true;
                            field.onChange(e.target.value.toLowerCase());
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Brief description..." className="resize-none" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="leave">Leave</SelectItem>
                          <SelectItem value="onduty">On-Duty</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="residency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Residency</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="hostel">Hostel</SelectItem>
                          <SelectItem value="day_scholar">Day Scholar</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => field.onChange(color)}
                                className={`w-6 h-6 rounded-full border-2 transition-all ${
                                  field.value === color
                                    ? 'border-primary ring-2 ring-primary/30'
                                    : 'border-transparent hover:border-gray-300'
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <Input
                            type="text"
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="#000000"
                            className="font-mono"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="max_duration_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="Blank = no limit"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="advance_notice_hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Advance Notice (hrs)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} value={field.value} onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} value={field.value} onChange={(e) => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="allow_half_day"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-sm">Allow Half Day</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allow_periodwise"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-sm">Allow Period-wise</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requires_attachment"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-sm">Attachment Required</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="affects_attendance"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-sm">Affects Attendance</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requires_sponsor_approval"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-sm">Requires Sponsor</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <FormLabel className="text-sm">Active</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {requiresSponsor && (
                <FormField
                  control={form.control}
                  name="sponsor_role_hint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sponsor Role Hint (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Faculty coordinator" {...field} />
                      </FormControl>
                      <FormDescription>Shown to the learner when picking a sponsor.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saveType.isPending}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saveType.isPending} className="w-full sm:w-auto">
                  {saveType.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {mode === 'create' ? 'Create' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
