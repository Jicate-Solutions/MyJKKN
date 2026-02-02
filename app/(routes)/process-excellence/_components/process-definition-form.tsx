/**
 * Process Definition Form Component
 *
 * React Hook Form for creating/editing process definitions with stages, SLA, and value-add targets
 */

'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { createProcessDefinitionSchema } from '@/lib/validations/process-excellence';
import { PROCESS_CATEGORY_LABELS } from '@/types/process-excellence';
import type { CreateProcessDefinitionInput } from '@/lib/validations/process-excellence';
import type { ProcessDefinition } from '@/types/process-excellence';

interface ProcessDefinitionFormProps {
  institutionId: string;
  initialData?: ProcessDefinition;
  onSubmit: (data: CreateProcessDefinitionInput) => void | Promise<void>;
  isLoading?: boolean;
}

export function ProcessDefinitionForm({
  institutionId,
  initialData,
  onSubmit,
  isLoading
}: ProcessDefinitionFormProps) {
  const form = useForm<CreateProcessDefinitionInput>({
    resolver: zodResolver(createProcessDefinitionSchema),
    defaultValues: initialData
      ? {
          institution_id: initialData.institution_id,
          name: initialData.name,
          description: initialData.description || '',
          category: initialData.category,
          stages: initialData.stages || [],
          target_cycle_time_hours: initialData.target_cycle_time_hours || undefined,
          target_value_add_ratio: initialData.target_value_add_ratio || undefined,
          sla_hours: initialData.sla_hours || undefined,
          is_active: initialData.is_active
        }
      : {
          institution_id: institutionId,
          name: '',
          description: '',
          category: 'academic',
          stages: [{ name: '', expected_duration_hours: 1, is_value_add: true, order: 0 }],
          is_active: true
        }
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'stages'
  });

  const handleSubmit = async (data: CreateProcessDefinitionInput) => {
    await onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Define the process name, category, and description</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Process Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Student Admission Process"
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(PROCESS_CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the purpose and scope of this process..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value || ''}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <FormDescription>
                      Inactive processes cannot be used for new instances
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isLoading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Process Stages */}
        <Card>
          <CardHeader>
            <CardTitle>Process Stages</CardTitle>
            <CardDescription>
              Define the sequential stages of this process and their expected durations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Stage {index + 1}</span>
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name={`stages.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stage Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Application Review"
                            {...field}
                            disabled={isLoading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`stages.${index}.expected_duration_hours`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (hours) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="e.g., 24"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            disabled={isLoading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name={`stages.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What happens in this stage?"
                          className="resize-none"
                          rows={2}
                          {...field}
                          value={field.value || ''}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`stages.${index}.is_value_add`}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Value-Adding Stage</FormLabel>
                        <FormDescription className="text-xs">
                          Does this stage directly add value from the customer perspective?
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  name: '',
                  expected_duration_hours: 1,
                  is_value_add: true,
                  order: fields.length
                })
              }
              disabled={isLoading || fields.length >= 20}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </CardContent>
        </Card>

        {/* Targets & SLA */}
        <Card>
          <CardHeader>
            <CardTitle>Targets & SLA</CardTitle>
            <CardDescription>
              Set performance targets for this process (optional but recommended)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="target_cycle_time_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Cycle Time (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g., 168"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseInt(e.target.value) : null)
                        }
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>Expected total completion time</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_value_add_ratio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Value-Add (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="e.g., 60"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>Desired value-add ratio</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sla_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g., 72"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseInt(e.target.value) : null)
                        }
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>Service level agreement</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : initialData ? 'Update Process' : 'Create Process'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
