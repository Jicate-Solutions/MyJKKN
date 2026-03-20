'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useRoles } from '@/hooks/organization/use-roles';
import { FieldBuilder } from './field-builder';
import { ApprovalStepBuilder } from './approval-step-builder';
import {
  createServiceTypeSchema,
  type CreateServiceTypeDto,
  type CreateServiceTypeFieldDto,
  type CreateApprovalStepDto,
  type ServiceType,
  type ApprovalWorkflowType,
} from '@/types/service-request';

interface ServiceTypeFormProps {
  initialData?: ServiceType;
  onSubmit: (data: CreateServiceTypeDto) => void;
  isSubmitting?: boolean;
}

export function ServiceTypeForm({ initialData, onSubmit, isSubmitting }: ServiceTypeFormProps) {
  const { data: rolesData, isLoading: rolesLoading } = useRoles();
  const [rolesPopoverOpen, setRolesPopoverOpen] = useState(false);

  const [fields, setFields] = useState<CreateServiceTypeFieldDto[]>(
    initialData?.fields?.map((f) => ({
      field_key: f.field_key,
      field_label: f.field_label,
      field_type: f.field_type,
      field_options: f.field_options || undefined,
      is_required: f.is_required,
      display_order: f.display_order,
      placeholder: f.placeholder || undefined,
      help_text: f.help_text || undefined,
      default_value: f.default_value || undefined,
    })) || []
  );

  const [approvalSteps, setApprovalSteps] = useState<CreateApprovalStepDto[]>(
    initialData?.approval_steps?.map((s) => ({
      step_order: s.step_order,
      step_name: s.step_name,
      approver_role: s.approver_role,
      is_required: s.is_required,
      on_return_restart_from_step: s.on_return_restart_from_step,
    })) || []
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateServiceTypeDto>({
    resolver: zodResolver(createServiceTypeSchema),
    defaultValues: {
      slug: initialData?.slug || '',
      name: initialData?.name || '',
      description: initialData?.description || '',
      icon: initialData?.icon || 'FileText',
      color: initialData?.color || '#3B82F6',
      allowed_roles: initialData?.allowed_roles || [],
      approval_workflow_type: initialData?.approval_workflow_type || 'sequential',
      max_active_requests: initialData?.max_active_requests || 1,
      auto_fulfill_on_approval: initialData?.auto_fulfill_on_approval || false,
      enable_priority: initialData?.enable_priority || false,
      enable_attachments: initialData?.enable_attachments || false,
      enable_email_notifications: initialData?.enable_email_notifications ?? true,
      fields: fields,
      approval_steps: approvalSteps,
    },
  });

  const watchedAllowedRoles = watch('allowed_roles');
  const enableAttachments = watch('enable_attachments');

  const handleFormSubmit = (data: CreateServiceTypeDto) => {
    onSubmit({
      ...data,
      fields,
      approval_steps: approvalSteps,
    });
  };

  const handleNameChange = (name: string) => {
    setValue('name', name);
    if (!initialData) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '');
      setValue('slug', slug);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g. Transfer Certificate"
                {...register('name')}
                onChange={(e) => handleNameChange(e.target.value)}
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug <span className="text-red-500">*</span>
              </Label>
              <Input
                id="slug"
                placeholder="auto-generated"
                {...register('slug')}
                readOnly={!!initialData}
                className={initialData ? 'bg-muted' : ''}
              />
              {errors.slug && (
                <p className="text-xs text-red-500">{errors.slug.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this service type..."
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="icon">Icon Name</Label>
              <Input
                id="icon"
                placeholder="e.g. FileText"
                {...register('icon')}
              />
              <p className="text-xs text-muted-foreground">Lucide icon name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  {...register('color')}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  placeholder="#3B82F6"
                  {...register('color')}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Allowed Roles <span className="text-red-500">*</span>
            </Label>
            <Popover open={rolesPopoverOpen} onOpenChange={setRolesPopoverOpen} modal>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={rolesPopoverOpen}
                  className={cn(
                    'w-full justify-between min-h-[42px] h-auto py-2 font-normal',
                    !watchedAllowedRoles?.length && 'text-muted-foreground'
                  )}
                  disabled={rolesLoading}
                >
                  {rolesLoading ? (
                    <span>Loading roles...</span>
                  ) : watchedAllowedRoles && watchedAllowedRoles.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {watchedAllowedRoles.map((roleKey) => {
                        const role = rolesData?.find((r) => r.role_key === roleKey);
                        return (
                          <Badge key={roleKey} variant="secondary" className="flex items-center gap-1">
                            {role?.role_name || roleKey}
                            <span
                              role="button"
                              tabIndex={0}
                              className="ml-0.5 hover:bg-accent rounded-full p-0.5 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = watchedAllowedRoles.filter((k) => k !== roleKey);
                                setValue('allowed_roles', updated, { shouldValidate: true });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  const updated = watchedAllowedRoles.filter((k) => k !== roleKey);
                                  setValue('allowed_roles', updated, { shouldValidate: true });
                                }
                              }}
                            >
                              <X className="h-3 w-3" />
                            </span>
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    'Select allowed roles...'
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search roles..." />
                  <CommandList className="max-h-[250px]">
                    <CommandEmpty>No roles found.</CommandEmpty>
                    <CommandGroup>
                      {rolesData?.map((role) => {
                        const isSelected = watchedAllowedRoles?.includes(role.role_key);
                        return (
                          <CommandItem
                            key={role.role_key}
                            value={role.role_name}
                            onSelect={() => {
                              const current = watchedAllowedRoles || [];
                              const updated = isSelected
                                ? current.filter((k) => k !== role.role_key)
                                : [...current, role.role_key];
                              setValue('allowed_roles', updated, { shouldValidate: true });
                            }}
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded border shrink-0',
                                isSelected
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground'
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{role.role_name}</span>
                              <span className="text-xs text-muted-foreground">{role.role_key}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.allowed_roles && (
              <p className="text-xs text-red-500">{errors.allowed_roles.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_active_requests">Max Active Requests per User</Label>
              <Input
                id="max_active_requests"
                type="number"
                min={1}
                {...register('max_active_requests', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="validity_period_days">Validity Period (days)</Label>
              <Input
                id="validity_period_days"
                type="number"
                min={1}
                placeholder="Optional"
                {...register('validity_period_days', {
                  setValueAs: (v) => (v === '' || v === null || v === undefined) ? null : Number(v),
                })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto_fulfill"
                checked={watch('auto_fulfill_on_approval')}
                onCheckedChange={(c) => setValue('auto_fulfill_on_approval', !!c)}
              />
              <Label htmlFor="auto_fulfill" className="cursor-pointer">
                Auto-fulfill on approval
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="enable_priority"
                checked={watch('enable_priority')}
                onCheckedChange={(c) => setValue('enable_priority', !!c)}
              />
              <Label htmlFor="enable_priority" className="cursor-pointer">
                Enable priority
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="enable_attachments"
                checked={watch('enable_attachments')}
                onCheckedChange={(c) => setValue('enable_attachments', !!c)}
              />
              <Label htmlFor="enable_attachments" className="cursor-pointer">
                Enable attachments
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="enable_email"
                checked={watch('enable_email_notifications')}
                onCheckedChange={(c) => setValue('enable_email_notifications', !!c)}
              />
              <Label htmlFor="enable_email" className="cursor-pointer">
                Email notifications
              </Label>
            </div>
          </div>

          {enableAttachments && (
            <div className="border rounded-md p-4 space-y-3 bg-muted/30">
              <Label className="text-sm font-medium">Attachment Configuration</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Max Files</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={initialData?.attachment_config?.max_files || 5}
                    onChange={(e) => {
                      const current = watch('attachment_config') || { max_files: 5, max_size_mb: 10, allowed_types: ['*'] };
                      setValue('attachment_config', { ...current, max_files: Number(e.target.value) });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Size (MB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={initialData?.attachment_config?.max_size_mb || 10}
                    onChange={(e) => {
                      const current = watch('attachment_config') || { max_files: 5, max_size_mb: 10, allowed_types: ['*'] };
                      setValue('attachment_config', { ...current, max_size_mb: Number(e.target.value) });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Allowed Types</Label>
                  <Input
                    placeholder="pdf, jpg, png"
                    defaultValue={initialData?.attachment_config?.allowed_types?.join(', ') || '*'}
                    onChange={(e) => {
                      const current = watch('attachment_config') || { max_files: 5, max_size_mb: 10, allowed_types: ['*'] };
                      const types = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                      setValue('attachment_config', { ...current, allowed_types: types });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Request Form</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldBuilder
            fields={fields}
            onChange={(newFields) => {
              setFields(newFields);
              setValue('fields', newFields, { shouldValidate: false });
            }}
          />
          {errors.fields && (
            <p className="text-xs text-red-500 mt-2">{errors.fields.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Approval Workflow */}
      <Card>
        <CardHeader>
          <CardTitle>Approval Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Workflow Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Workflow Type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors',
                  watch('approval_workflow_type') === 'sequential'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                )}
                onClick={() => setValue('approval_workflow_type', 'sequential')}
              >
                <span className="font-medium text-sm">Sequential</span>
                <span className="text-xs text-muted-foreground">
                  Steps execute in order. Step 2 waits for Step 1 to be approved.
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors',
                  watch('approval_workflow_type') === 'parallel'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                )}
                onClick={() => setValue('approval_workflow_type', 'parallel')}
              >
                <span className="font-medium text-sm">Parallel</span>
                <span className="text-xs text-muted-foreground">
                  All approvers are notified simultaneously. All must approve.
                </span>
              </button>
            </div>
          </div>

          <Separator />

          {/* Approval Steps */}
          <ApprovalStepBuilder
            steps={approvalSteps}
            onChange={(newSteps) => {
              setApprovalSteps(newSteps);
              setValue('approval_steps', newSteps, { shouldValidate: false });
            }}
            availableRoles={rolesData?.map((r) => r.role_key) || []}
            workflowType={watch('approval_workflow_type') as ApprovalWorkflowType}
          />
          {errors.approval_steps && (
            <p className="text-xs text-red-500 mt-2">{errors.approval_steps.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : initialData
              ? 'Update Service Type'
              : 'Create Service Type'}
        </Button>
      </div>
    </form>
  );
}
