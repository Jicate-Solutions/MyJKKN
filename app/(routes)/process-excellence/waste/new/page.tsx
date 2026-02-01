/**
 * Report New Waste Incident Page
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useReportWaste, useActiveProcessDefinitions } from '@/hooks/process-excellence';
import {
  createWasteIncidentSchema,
  type CreateWasteIncidentInput
} from '@/lib/validations/process-excellence';
import { WASTE_LABELS, WASTE_DESCRIPTIONS, WASTE_COLORS } from '@/types/process-excellence';
import type { WasteCategory } from '@/types/process-excellence';

export default function NewWasteIncidentPage() {
  const router = useRouter();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const reportWaste = useReportWaste();
  const { data: processes } = useActiveProcessDefinitions(selectedInstitutionId || '');

  const form = useForm<CreateWasteIncidentInput>({
    resolver: zodResolver(createWasteIncidentSchema),
    defaultValues: {
      institution_id: selectedInstitutionId || '',
      waste_category: 'W',
      description: '',
      estimated_time_lost_hours: undefined,
      estimated_cost_impact: undefined,
      root_cause: '',
      corrective_action: ''
    }
  });

  const onSubmit = async (data: CreateWasteIncidentInput) => {
    if (!selectedInstitutionId) return;

    try {
      await reportWaste.mutateAsync({
        institution_id: selectedInstitutionId,
        waste_category: data.waste_category,
        description: data.description,
        process_id: data.process_id ?? undefined,
        process_instance_id: data.process_instance_id ?? undefined,
        estimated_time_lost_hours: data.estimated_time_lost_hours ?? undefined,
        estimated_cost_impact: data.estimated_cost_impact ?? undefined,
        root_cause: data.root_cause ?? undefined,
        corrective_action: data.corrective_action ?? undefined
      });
      router.push('/process-excellence/waste');
    } catch (error) {
      // Error handled by hook
    }
  };

  if (!selectedInstitutionId) {
    return (
      <ContentLayout title='Report Waste'>
        <Card>
          <CardContent className='py-10 text-center text-muted-foreground'>
            Please select an institution to report a waste incident.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Report Waste Incident'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Waste Incidents', href: '/process-excellence/waste' },
          { label: 'New', href: '/process-excellence/waste/new' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Report Waste Incident</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Log a TIMWOOD waste incident for tracking and continuous improvement
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Waste Details</CardTitle>
                <CardDescription>
                  Identify and describe the waste incident
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <FormField
                  control={form.control}
                  name='waste_category'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Waste Category *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select waste category' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.keys(WASTE_LABELS) as WasteCategory[]).map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              <div className='flex items-center gap-2'>
                                <div
                                  className='w-3 h-3 rounded-full'
                                  style={{ backgroundColor: WASTE_COLORS[cat] }}
                                />
                                <span className='font-medium'>{cat}:</span>
                                <span>{WASTE_LABELS[cat]}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {form.watch('waste_category') &&
                          WASTE_DESCRIPTIONS[form.watch('waste_category') as WasteCategory]}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='process_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Process (Optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select process (optional)' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {processes?.map((process) => (
                            <SelectItem key={process.id} value={process.id}>
                              {process.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Link this incident to a specific process if applicable
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='Describe the waste incident in detail...'
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        Be specific about what happened, when, and where
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Impact Estimation</CardTitle>
                <CardDescription>
                  Estimate the impact of this waste incident
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='grid gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='estimated_time_lost_hours'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time Lost (Hours)</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            step='0.5'
                            min='0'
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? parseFloat(e.target.value) : undefined
                              )
                            }
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormDescription>
                          Estimated hours lost due to this incident
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='estimated_cost_impact'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost Impact (Rs.)</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min='0'
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? parseFloat(e.target.value) : undefined
                              )
                            }
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormDescription>
                          Estimated financial impact in Rupees
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Root Cause Analysis</CardTitle>
                <CardDescription>
                  Document the cause and potential solutions
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <FormField
                  control={form.control}
                  name='root_cause'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Root Cause</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ''}
                          placeholder='What was the underlying cause of this waste?'
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='corrective_action'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Corrective Action</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ''}
                          placeholder='What actions can be taken to prevent recurrence?'
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className='flex justify-end gap-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={reportWaste.isPending}>
                {reportWaste.isPending ? 'Reporting...' : 'Report Waste Incident'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
