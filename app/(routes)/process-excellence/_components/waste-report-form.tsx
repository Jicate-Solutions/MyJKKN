/**
 * Waste Report Form Component
 *
 * Form for logging TIMWOOD waste incidents with category, cost, and root cause
 */

'use client';

import { useForm } from 'react-hook-form';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createWasteIncidentSchema } from '@/lib/validations/process-excellence';
import { WASTE_LABELS, WASTE_DESCRIPTIONS, WASTE_COLORS } from '@/types/process-excellence';
import type { CreateWasteIncidentInput } from '@/lib/validations/process-excellence';
import type { WasteIncident, WasteCategory } from '@/types/process-excellence';

interface WasteReportFormProps {
  institutionId: string;
  processId?: string;
  processInstanceId?: string;
  initialData?: WasteIncident;
  onSubmit: (data: CreateWasteIncidentInput) => void | Promise<void>;
  isLoading?: boolean;
}

export function WasteReportForm({
  institutionId,
  processId,
  processInstanceId,
  initialData,
  onSubmit,
  isLoading
}: WasteReportFormProps) {
  const form = useForm<CreateWasteIncidentInput>({
    resolver: zodResolver(createWasteIncidentSchema),
    defaultValues: initialData
      ? {
          institution_id: initialData.institution_id,
          process_id: initialData.process_id,
          process_instance_id: initialData.process_instance_id,
          waste_category: initialData.waste_category,
          description: initialData.description,
          estimated_time_lost_hours: initialData.estimated_time_lost_hours || undefined,
          estimated_cost_impact: initialData.estimated_cost_impact || undefined,
          root_cause: initialData.root_cause || undefined,
          corrective_action: initialData.corrective_action || undefined
        }
      : {
          institution_id: institutionId,
          process_id: processId || undefined,
          process_instance_id: processInstanceId || undefined,
          waste_category: 'W',
          description: '',
          estimated_time_lost_hours: undefined,
          estimated_cost_impact: undefined,
          root_cause: undefined,
          corrective_action: undefined
        }
  });

  const selectedCategory = form.watch('waste_category');

  const handleSubmit = async (data: CreateWasteIncidentInput) => {
    await onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* TIMWOOD Category */}
        <Card>
          <CardHeader>
            <CardTitle>Waste Category</CardTitle>
            <CardDescription>Select the type of waste (TIMWOOD framework)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="waste_category"
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
                        <SelectValue placeholder="Select waste category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(WASTE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{
                                backgroundColor: WASTE_COLORS[key as WasteCategory]
                              }}
                            />
                            <span className="font-medium">{key}</span>
                            <span className="text-muted-foreground">- {label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {WASTE_DESCRIPTIONS[selectedCategory as WasteCategory]}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Incident Details */}
        <Card>
          <CardHeader>
            <CardTitle>Incident Details</CardTitle>
            <CardDescription>Describe what happened and its impact</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the waste incident in detail (minimum 10 characters)..."
                      className="resize-none"
                      rows={4}
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    What happened? Where did it occur? Who was affected?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="estimated_time_lost_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Lost (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="e.g., 2.5"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>Estimated time wasted</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estimated_cost_impact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Impact (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        placeholder="e.g., 5000"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormDescription>Estimated financial impact</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Root Cause & Corrective Action */}
        <Card>
          <CardHeader>
            <CardTitle>Analysis</CardTitle>
            <CardDescription>
              Root cause analysis and corrective actions (can be added later)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="root_cause"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Root Cause</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why did this waste occur? What was the underlying cause?"
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
              name="corrective_action"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Corrective Action</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What actions will be taken to prevent this from happening again?"
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
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : initialData ? 'Update Incident' : 'Report Waste'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
