'use client';

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
import { useLeaveTypes } from '@/hooks/academic/use-leave-types';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { toast } from 'react-hot-toast';
import { LEAVE_TYPE_COLORS } from '@/types/leaves';
import type { LeaveType } from '@/types/leaves';

const leaveTypeFormSchema = z.object({
  leave_type_code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(20, 'Code must be at most 20 characters')
    .regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers, and underscores only'),
  leave_type_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  color_code: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
  requires_approval: z.boolean(),
  is_active: z.boolean()
});

type LeaveTypeFormValues = z.infer<typeof leaveTypeFormSchema>;

interface LeaveTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  leaveType?: LeaveType;
}

const PRESET_COLORS = [
  { name: 'Red', value: LEAVE_TYPE_COLORS.GAZETTED },
  { name: 'Blue', value: LEAVE_TYPE_COLORS.STUDY },
  { name: 'Amber', value: LEAVE_TYPE_COLORS.EMERGENCY },
  { name: 'Purple', value: LEAVE_TYPE_COLORS.EXAM },
  { name: 'Gray', value: LEAVE_TYPE_COLORS.CUSTOM },
  { name: 'Green', value: '#22C55E' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Indigo', value: '#6366F1' }
];

export function LeaveTypeFormDialog({
  open,
  onOpenChange,
  mode,
  leaveType
}: LeaveTypeFormDialogProps) {
  const { userProfile, isSuperAdmin } = usePermissions();
  const { createLeaveType, updateLeaveType, loading } = useLeaveTypes();
  const { institutions } = useInstitutionsWithAccess();
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  const form = useForm<LeaveTypeFormValues>({
    resolver: zodResolver(leaveTypeFormSchema),
    defaultValues: {
      leave_type_code: '',
      leave_type_name: '',
      description: '',
      color_code: LEAVE_TYPE_COLORS.CUSTOM,
      requires_approval: true,
      is_active: true
    }
  });

  // Reset form when dialog opens/closes or when editing different leave type
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && leaveType) {
        form.reset({
          leave_type_code: leaveType.leave_type_code,
          leave_type_name: leaveType.leave_type_name,
          description: leaveType.description || '',
          color_code: leaveType.color_code,
          requires_approval: leaveType.requires_approval,
          is_active: leaveType.is_active
        });
        setSelectedInstitutionId(leaveType.institution_id);
      } else {
        form.reset({
          leave_type_code: '',
          leave_type_name: '',
          description: '',
          color_code: LEAVE_TYPE_COLORS.CUSTOM,
          requires_approval: true,
          is_active: true
        });
        // Set default institution for non-super admins
        if (!isSuperAdmin && userProfile?.institution_id) {
          setSelectedInstitutionId(userProfile.institution_id);
        } else {
          setSelectedInstitutionId('');
        }
      }
    }
  }, [open, mode, leaveType, form, isSuperAdmin, userProfile?.institution_id]);

  const onSubmit = async (data: LeaveTypeFormValues) => {
    try {
      if (mode === 'create') {
        // Use selectedInstitutionId for super admin, or userProfile.institution_id for others
        const institutionId = isSuperAdmin ? selectedInstitutionId : userProfile?.institution_id;
        if (!institutionId) {
          toast.error('Please select an institution');
          return;
        }
        await createLeaveType({
          ...data,
          institution_id: institutionId,
          created_by: userProfile?.id
        });
        toast.success('Leave type created successfully');
      } else if (leaveType) {
        await updateLeaveType(leaveType.id, data);
        toast.success('Leave type updated successfully');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        mode === 'create' ? 'Failed to create leave type' : 'Failed to update leave type'
      );
    }
  };

  const selectedColor = form.watch('color_code');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[500px] max-h-[90vh] p-0'>
        <DialogHeader className='px-4 pt-4 sm:px-6 sm:pt-6'>
          <DialogTitle>
            {mode === 'create' ? 'Create Leave Type' : 'Edit Leave Type'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new leave type category for your institution.'
              : 'Update the leave type details.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[calc(90vh-120px)] px-4 sm:px-6'>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 pb-4'>
              {/* Institution Selector for Super Admin */}
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
                  <FormDescription>
                    Select the institution for this leave type
                  </FormDescription>
                </FormItem>
              )}

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                {/* Leave Type Code */}
                <FormField
                  control={form.control}
                  name='leave_type_code'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g., GAZETTED'
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Leave Type Name */}
                <FormField
                  control={form.control}
                  name='leave_type_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder='e.g., Gazetted Holiday' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Description */}
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
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Color Selection */}
              <FormField
                control={form.control}
                name='color_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className='space-y-3'>
                        {/* Preset Colors */}
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
                        {/* Custom Color Input */}
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
                    <FormDescription>
                      Select a color for calendar display
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                {/* Requires Approval */}
                <FormField
                  control={form.control}
                  name='requires_approval'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>Requires Approval</FormLabel>
                        <FormDescription className='text-xs'>
                          Must be approved before applied
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Is Active */}
                <FormField
                  control={form.control}
                  name='is_active'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>Active</FormLabel>
                        <FormDescription className='text-xs'>
                          Available for selection
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Form Actions */}
              <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={loading} className='w-full sm:w-auto'>
                  {loading && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
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
