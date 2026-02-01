/**
 * Create New Process Audit Page
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
import {
  useCreateProcessAudit,
  useActiveProcessDefinitions
} from '@/hooks/process-excellence';
import {
  createProcessAuditSchema,
  type CreateProcessAuditInput
} from '@/lib/validations/process-excellence';

export default function NewProcessAuditPage() {
  const router = useRouter();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const createAudit = useCreateProcessAudit();
  const { data: processes, isLoading: processesLoading } = useActiveProcessDefinitions(
    selectedInstitutionId || ''
  );

  // Default to last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const form = useForm<CreateProcessAuditInput>({
    resolver: zodResolver(createProcessAuditSchema),
    defaultValues: {
      institution_id: selectedInstitutionId || '',
      process_id: '',
      audit_period_start: thirtyDaysAgo.toISOString().split('T')[0],
      audit_period_end: today.toISOString().split('T')[0],
      findings: '',
      recommendations: ''
    }
  });

  const onSubmit = async (data: CreateProcessAuditInput) => {
    if (!selectedInstitutionId) return;

    try {
      await createAudit.mutateAsync({
        institution_id: selectedInstitutionId,
        process_id: data.process_id,
        audit_period_start: data.audit_period_start,
        audit_period_end: data.audit_period_end,
        findings: data.findings ?? undefined,
        recommendations: data.recommendations ?? undefined
      });
      router.push('/process-excellence/audits');
    } catch (error) {
      // Error handled by hook
    }
  };

  if (!selectedInstitutionId) {
    return (
      <ContentLayout title='New Audit'>
        <Card>
          <CardContent className='py-10 text-center text-muted-foreground'>
            Please select an institution to create an audit.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Create Process Audit'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Process Excellence', href: '/process-excellence' },
          { label: 'Audits', href: '/process-excellence/audits' },
          { label: 'New', href: '/process-excellence/audits/new' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Process Audit</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Generate an audit report for a specific process and time period
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Audit Configuration</CardTitle>
                <CardDescription>
                  Select the process and time period to audit
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <FormField
                  control={form.control}
                  name='process_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Process *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={processesLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                processesLoading
                                  ? 'Loading processes...'
                                  : 'Select process to audit'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {processes?.map((process) => (
                            <SelectItem key={process.id} value={process.id}>
                              {process.name} ({process.category})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The process definition to generate an audit report for
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='grid gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='audit_period_start'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period Start *</FormLabel>
                        <FormControl>
                          <Input type='date' {...field} />
                        </FormControl>
                        <FormDescription>
                          Start date for the audit period
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='audit_period_end'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period End *</FormLabel>
                        <FormControl>
                          <Input type='date' {...field} />
                        </FormControl>
                        <FormDescription>
                          End date for the audit period
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
                <CardTitle>Initial Observations</CardTitle>
                <CardDescription>
                  Add any initial findings or recommendations (optional, can be added later)
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <FormField
                  control={form.control}
                  name='findings'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Findings</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ''}
                          placeholder='Document key findings from the audit...'
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        Key observations and issues identified
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='recommendations'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recommendations</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ''}
                          placeholder='Suggest improvements and next steps...'
                          rows={4}
                        />
                      </FormControl>
                      <FormDescription>
                        Suggested actions for improvement
                      </FormDescription>
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
              <Button
                type='submit'
                disabled={createAudit.isPending || !form.watch('process_id')}
              >
                {createAudit.isPending ? 'Creating...' : 'Create Audit'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
