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
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { LeaveApprovalService } from '@/lib/services/academic/leave-approval-service';
import { useActiveLeaveTypes } from '@/hooks/academic/use-leave-types';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'react-hot-toast';
import { LEAVE_SCOPE_OPTIONS } from '@/types/leaves';
import type { LeaveApprovalChain, LeaveScopeLevel } from '@/types/leaves';

const workflowFormSchema = z.object({
  scope_level: z.enum(['institution', 'department', 'semester', 'section'] as const),
  leave_type_id: z.string().optional(),
  chain_order: z.coerce.number().min(1, 'Order must be at least 1').max(10, 'Order must be at most 10'),
  approver_role: z.string().min(1, 'Approver role is required'),
  approver_scope: z.string().optional(),
  is_required: z.boolean(),
  can_skip_if_approved_by_higher: z.boolean(),
  is_active: z.boolean()
});

type WorkflowFormValues = z.infer<typeof workflowFormSchema>;

interface WorkflowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  workflow?: LeaveApprovalChain;
}

const APPROVER_ROLES = [
  { value: 'hod', label: 'Head of Department' },
  { value: 'principal', label: 'Principal' },
  { value: 'admin', label: 'Administrator' },
  { value: 'management', label: 'Management' }
];

const APPROVER_SCOPES = [
  { value: 'same_department', label: 'Same Department Only' },
  { value: 'any', label: 'Any Department' }
];

// Special value for "All Leave Types" since Radix Select doesn't allow empty strings
const ALL_LEAVE_TYPES_VALUE = '__all__';

export function WorkflowFormDialog({
  open,
  onOpenChange,
  mode,
  workflow
}: WorkflowFormDialogProps) {
  const { userProfile } = usePermissions();
  const { leaveTypes } = useActiveLeaveTypes(userProfile?.institution_id);
  const [loading, setLoading] = useState(false);

  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: {
      scope_level: 'institution',
      leave_type_id: ALL_LEAVE_TYPES_VALUE,
      chain_order: 1,
      approver_role: 'hod', // Default to first role
      approver_scope: 'any',
      is_required: true,
      can_skip_if_approved_by_higher: true,
      is_active: true
    }
  });

  // Reset form when dialog opens/closes or when editing different workflow
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && workflow) {
        form.reset({
          scope_level: workflow.scope_level,
          leave_type_id: workflow.leave_type_id || ALL_LEAVE_TYPES_VALUE,
          chain_order: workflow.chain_order,
          approver_role: workflow.approver_role,
          approver_scope: workflow.approver_scope || 'any',
          is_required: workflow.is_required,
          can_skip_if_approved_by_higher: workflow.can_skip_if_approved_by_higher,
          is_active: workflow.is_active
        });
      } else {
        form.reset({
          scope_level: 'institution',
          leave_type_id: ALL_LEAVE_TYPES_VALUE,
          chain_order: 1,
          approver_role: 'hod', // Default to first role
          approver_scope: 'any',
          is_required: true,
          can_skip_if_approved_by_higher: true,
          is_active: true
        });
      }
    }
  }, [open, mode, workflow, form]);

  const onSubmit = async (data: WorkflowFormValues) => {
    try {
      setLoading(true);

      // Convert special value back to undefined for database
      const leaveTypeId = data.leave_type_id === ALL_LEAVE_TYPES_VALUE ? undefined : data.leave_type_id;

      if (mode === 'create') {
        if (!userProfile?.institution_id) {
          toast.error('No institution selected');
          return;
        }
        await LeaveApprovalService.createApprovalChain({
          institution_id: userProfile.institution_id,
          scope_level: data.scope_level as LeaveScopeLevel,
          leave_type_id: leaveTypeId,
          chain_order: data.chain_order,
          approver_role: data.approver_role,
          approver_scope: data.approver_scope,
          is_required: data.is_required,
          can_skip_if_approved_by_higher: data.can_skip_if_approved_by_higher,
          is_active: data.is_active
        });
        toast.success('Approval workflow created successfully');
      } else if (workflow) {
        await LeaveApprovalService.updateApprovalChain(workflow.id, {
          chain_order: data.chain_order,
          approver_role: data.approver_role,
          approver_scope: data.approver_scope,
          is_required: data.is_required,
          can_skip_if_approved_by_higher: data.can_skip_if_approved_by_higher,
          is_active: data.is_active
        });
        toast.success('Approval workflow updated successfully');
      }

      // Trigger a refresh
      window.dispatchEvent(new CustomEvent('workflow-updated'));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        mode === 'create'
          ? 'Failed to create approval workflow'
          : 'Failed to update approval workflow'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[500px] max-h-[90vh] p-0'>
        <DialogHeader className='px-4 pt-4 sm:px-6 sm:pt-6'>
          <DialogTitle>
            {mode === 'create' ? 'Add Approval Workflow' : 'Edit Approval Workflow'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Configure a new approval workflow step for leave requests.'
              : 'Update the approval workflow configuration.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[calc(90vh-120px)] px-4 sm:px-6'>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 pb-4'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {/* Scope Level */}
              <FormField
                control={form.control}
                name='scope_level'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope Level</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      disabled={mode === 'edit'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select scope' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAVE_SCOPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Chain Order */}
              <FormField
                control={form.control}
                name='chain_order'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Step Order</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={10}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Leave Type (Optional) */}
            <FormField
              control={form.control}
              name='leave_type_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type (Optional)</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                    disabled={mode === 'edit'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='All leave types' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={ALL_LEAVE_TYPES_VALUE}>All Leave Types</SelectItem>
                      {leaveTypes
                        .filter((type) => type.id && type.id.trim() !== '')
                        .map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <div className='flex items-center gap-2'>
                              <span
                                className='w-3 h-3 rounded-full'
                                style={{ backgroundColor: type.color_code }}
                              />
                              {type.leave_type_name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Leave blank to apply to all leave types
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {/* Approver Role */}
              <FormField
                control={form.control}
                name='approver_role'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approver Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select role' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {APPROVER_ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Approver Scope */}
              <FormField
                control={form.control}
                name='approver_scope'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approver Scope</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select scope' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {APPROVER_SCOPES.map((scope) => (
                          <SelectItem key={scope.value} value={scope.value}>
                            {scope.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Switches */}
            <div className='space-y-4'>
              <FormField
                control={form.control}
                name='is_required'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>Required Step</FormLabel>
                      <FormDescription className='text-xs'>
                        This approval step is mandatory
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
                name='can_skip_if_approved_by_higher'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>Can Skip if Higher Approved</FormLabel>
                      <FormDescription className='text-xs'>
                        Skip this step if a higher authority approves
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
                      <FormLabel>Active</FormLabel>
                      <FormDescription className='text-xs'>
                        Enable this workflow step
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
