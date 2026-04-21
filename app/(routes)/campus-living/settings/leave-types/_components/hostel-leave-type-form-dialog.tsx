'use client';

// Campus-living hostel leave type create/edit dialog.
// Bespoke form — hostel has 4 flags (parent_consent, chief_warden, attachment)
// and 2 numeric fields (default_max_duration_days, advance_notice_hours)
// that academic's leave-type form doesn't have. Shared-form abstraction would
// have forced awkward discriminated-union props — kept per-module.

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useHostelLeaveTypes } from '@/hooks/campus-living/use-hostel-leave-types';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { toast } from 'react-hot-toast';
import {
  HOSTEL_LEAVE_TYPE_COLORS,
  type HostelLeaveType
} from '@/types/hostel-leave-types';

const formSchema = z.object({
  leave_type_code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(30, 'Code must be at most 30 characters')
    .regex(
      /^[a-z0-9_]+$/,
      'Code must be lowercase letters, numbers, and underscores only'
    ),
  leave_type_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  description: z.string().max(500).optional(),
  color_code: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
  default_max_duration_days: z
    .union([z.string(), z.number()])
    .transform((v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      return isNaN(n) ? null : n;
    })
    .refine((v) => v === null || v > 0, 'Must be a positive integer or blank')
    .nullable(),
  advance_notice_hours: z
    .union([z.string(), z.number()])
    .transform((v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      return isNaN(n) ? null : n;
    })
    .refine((v) => v === null || v >= 0, 'Must be a non-negative integer or blank')
    .nullable(),
  requires_parent_consent: z.boolean(),
  requires_chief_warden: z.boolean(),
  requires_attachment: z.boolean(),
  is_active: z.boolean()
});

type FormValues = z.infer<typeof formSchema>;

interface HostelLeaveTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  leaveType?: HostelLeaveType;
}

const PRESET_COLORS = [
  { name: 'Home', value: HOSTEL_LEAVE_TYPE_COLORS.HOME },
  { name: 'Weekend', value: HOSTEL_LEAVE_TYPE_COLORS.WEEKEND },
  { name: 'Vacation', value: HOSTEL_LEAVE_TYPE_COLORS.VACATION },
  { name: 'Emergency', value: HOSTEL_LEAVE_TYPE_COLORS.EMERGENCY },
  { name: 'Medical', value: HOSTEL_LEAVE_TYPE_COLORS.MEDICAL },
  { name: 'Academic', value: HOSTEL_LEAVE_TYPE_COLORS.ACADEMIC },
  { name: 'Night', value: HOSTEL_LEAVE_TYPE_COLORS.NIGHT },
  { name: 'Festival', value: HOSTEL_LEAVE_TYPE_COLORS.FESTIVAL },
  { name: 'Custom', value: HOSTEL_LEAVE_TYPE_COLORS.CUSTOM }
];

export function HostelLeaveTypeFormDialog({
  open,
  onOpenChange,
  mode,
  leaveType
}: HostelLeaveTypeFormDialogProps) {
  const { userProfile, isSuperAdmin } = usePermissions();
  const { createHostelLeaveType, updateHostelLeaveType } = useHostelLeaveTypes();
  const { institutions } = useInstitutionsWithAccess();
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leave_type_code: '',
      leave_type_name: '',
      description: '',
      color_code: HOSTEL_LEAVE_TYPE_COLORS.CUSTOM,
      default_max_duration_days: null,
      advance_notice_hours: null,
      requires_parent_consent: true,
      requires_chief_warden: false,
      requires_attachment: false,
      is_active: true
    }
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && leaveType) {
      form.reset({
        leave_type_code: leaveType.leave_type_code,
        leave_type_name: leaveType.leave_type_name,
        description: leaveType.description || '',
        color_code: leaveType.color_code,
        default_max_duration_days: leaveType.default_max_duration_days,
        advance_notice_hours: leaveType.advance_notice_hours,
        requires_parent_consent: leaveType.requires_parent_consent,
        requires_chief_warden: leaveType.requires_chief_warden,
        requires_attachment: leaveType.requires_attachment,
        is_active: leaveType.is_active
      });
      setSelectedInstitutionId(leaveType.institution_id);
    } else {
      form.reset({
        leave_type_code: '',
        leave_type_name: '',
        description: '',
        color_code: HOSTEL_LEAVE_TYPE_COLORS.CUSTOM,
        default_max_duration_days: null,
        advance_notice_hours: null,
        requires_parent_consent: true,
        requires_chief_warden: false,
        requires_attachment: false,
        is_active: true
      });
      if (!isSuperAdmin && userProfile?.institution_id) {
        setSelectedInstitutionId(userProfile.institution_id);
      } else {
        setSelectedInstitutionId('');
      }
    }
  }, [open, mode, leaveType, form, isSuperAdmin, userProfile?.institution_id]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      if (mode === 'create') {
        const institutionId = isSuperAdmin
          ? selectedInstitutionId
          : userProfile?.institution_id;
        if (!institutionId) {
          toast.error('Please select an institution');
          return;
        }
        await createHostelLeaveType({
          institution_id: institutionId,
          ...data,
          description: data.description || null,
          created_by: userProfile?.id ?? null
        });
        toast.success('Hostel leave type created');
      } else if (leaveType) {
        await updateHostelLeaveType(leaveType.id, {
          ...data,
          description: data.description || null
        });
        toast.success('Hostel leave type updated');
      }
      onOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Failed to save hostel leave type';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedColor = form.watch('color_code');
  const isSystem = mode === 'edit' && leaveType?.is_system;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] p-0'>
        <DialogHeader className='px-4 pt-4 sm:px-6 sm:pt-6'>
          <DialogTitle>
            {mode === 'create' ? 'Create Hostel Leave Type' : 'Edit Hostel Leave Type'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new leave category for hostelers at your institution.'
              : isSystem
              ? 'You can edit this system default, but it cannot be deleted.'
              : 'Update the leave type details.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[calc(90vh-120px)] px-4 sm:px-6'>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 pb-4'
            >
              {isSuperAdmin && mode === 'create' && (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  <Select
                    value={selectedInstitutionId}
                    onValueChange={setSelectedInstitutionId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select an institution' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Select the institution for this leave type</FormDescription>
                </FormItem>
              )}

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='leave_type_code'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g., home_visit'
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.value.toLowerCase())
                          }
                          disabled={isSystem}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='leave_type_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder='e.g., Home Visit' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Brief description of this leave type...'
                        className='resize-none'
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='color_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className='space-y-3'>
                        <div className='flex flex-wrap gap-2'>
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color.value}
                              type='button'
                              onClick={() => field.onChange(color.value)}
                              className={`w-8 h-8 rounded-full border-2 transition-all ${
                                selectedColor === color.value
                                  ? 'border-primary ring-2 ring-primary/30'
                                  : 'border-transparent hover:border-gray-300'
                              }`}
                              style={{ backgroundColor: color.value }}
                              title={color.name}
                            />
                          ))}
                        </div>
                        <div className='flex items-center gap-2'>
                          <Input
                            type='color'
                            {...field}
                            className='w-12 h-9 p-1 cursor-pointer'
                          />
                          <Input
                            type='text'
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder='#000000'
                            className='flex-1 font-mono'
                          />
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='default_max_duration_days'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Max Days</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          placeholder='Leave blank = no limit'
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? null : e.target.value
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Per-college override lives in leave config.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='advance_notice_hours'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Advance Notice (hours)</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          placeholder='e.g., 24'
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? null : e.target.value
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid grid-cols-1 gap-3'>
                <FormField
                  control={form.control}
                  name='requires_parent_consent'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>Parent Consent</FormLabel>
                        <FormDescription className='text-xs'>
                          Hosteler needs parent approval before apply
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='requires_chief_warden'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>Chief Warden Approval</FormLabel>
                        <FormDescription className='text-xs'>
                          Escalate to chief warden instead of stopping at block warden
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='requires_attachment'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>Attachment Required</FormLabel>
                        <FormDescription className='text-xs'>
                          E.g. medical certificate, consent letter
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='is_active'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>Active</FormLabel>
                        <FormDescription className='text-xs'>
                          Available for selection in leave requests
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={submitting} className='w-full sm:w-auto'>
                  {submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
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
