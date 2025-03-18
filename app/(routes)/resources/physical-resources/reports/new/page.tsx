'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
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
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ContentLayout } from '@/components/layout/content-layout';
import { useUsageReports } from '@/hooks/resource/physical/use-usage-reports';
import { useResources } from '@/hooks/resource/physical/use-resources';
import { cn } from '@/lib/utils';

const formSchema = z
  .object({
    resource_id: z
      .string({
        required_error: 'Please select a resource'
      })
      .min(1, 'Please select a resource'),
    start_date: z.date({
      required_error: 'Please select a start date'
    }),
    end_date: z.date({
      required_error: 'Please select an end date'
    })
  })
  .refine(
    (data) => {
      return data.start_date <= data.end_date;
    },
    {
      message: 'End date must be after start date',
      path: ['end_date']
    }
  );

type FormValues = z.infer<typeof formSchema>;

export default function GenerateReportPage() {
  const router = useRouter();
  const { generateReport } = useUsageReports();
  const { resources, loading: resourcesLoading } = useResources();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resource_id: '',
      start_date: new Date(new Date().setDate(new Date().getDate() - 30)),
      end_date: new Date()
    }
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setSubmitting(true);

      if (!values.resource_id || values.resource_id.trim() === '') {
        toast.error('Please select a resource');
        setSubmitting(false);
        return;
      }

      console.log('Generating report with values:', values);
      const formattedStartDate = format(values.start_date, 'yyyy-MM-dd');
      const formattedEndDate = format(values.end_date, 'yyyy-MM-dd');

      console.log('Formatted dates:', { formattedStartDate, formattedEndDate });
      
      const reportId = await generateReport(
        values.resource_id,
        formattedStartDate,
        formattedEndDate
      );

      console.log('Report generated successfully with ID:', reportId);
      toast.success('Report generated successfully');
      router.push(`/resources/physical-resources/reports/${reportId}`);
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Generate Report'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/dashboard'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/reports'>Usage Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Generate Report</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Generate Usage Report</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new resource usage report
          </p>
        </div>

        <Card className='mx-auto w-full max-w-2xl'>
          <CardHeader>
            <CardTitle>Generate Usage Report</CardTitle>
            <CardDescription>
              Create a new usage report for a specific resource and time period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resourcesLoading ? (
              <div className='flex justify-center items-center py-8'>
                <Loader2 className='h-8 w-8 animate-spin text-primary' />
              </div>
            ) : resources.length === 0 ? (
              <div className='text-center py-8'>
                <p className='text-muted-foreground'>
                  No resources available. Please create a resource first.
                </p>
                <Button asChild className='mt-4'>
                  <Link href='/resources/physical-resources/new'>Create Resource</Link>
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form
                  id='report-form'
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-6'
                >
                  <FormField
                    control={form.control}
                    name='resource_id'
                    render={({ field }) => (
                      <FormItem className='flex flex-col'>
                        <FormLabel>Resource</FormLabel>
                        <Select
                          disabled={submitting}
                          onValueChange={field.onChange}
                          value={field.value}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select a resource' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {resources.map((resource) => (
                              <SelectItem key={resource.id} value={resource.id}>
                                {resource.resource_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
                    <FormField
                      control={form.control}
                      name='start_date'
                      render={({ field }) => (
                        <FormItem className='flex flex-col'>
                          <FormLabel>Start Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant='outline'
                                  className={cn(
                                    'w-full pl-3 text-left font-normal',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                  disabled={submitting}
                                >
                                  {field.value ? (
                                    format(field.value, 'PPP')
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className='w-auto p-0'
                              align='start'
                            >
                              <Calendar
                                mode='single'
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date > new Date() ||
                                  (form.getValues().end_date
                                    ? date > form.getValues().end_date
                                    : false)
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormDescription>
                            The start date of the report period
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='end_date'
                      render={({ field }) => (
                        <FormItem className='flex flex-col'>
                          <FormLabel>End Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant='outline'
                                  className={cn(
                                    'w-full pl-3 text-left font-normal',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                  disabled={submitting}
                                >
                                  {field.value ? (
                                    format(field.value, 'PPP')
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className='w-auto p-0'
                              align='start'
                            >
                              <Calendar
                                mode='single'
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date > new Date() ||
                                  (form.getValues().start_date
                                    ? date < form.getValues().start_date
                                    : false)
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormDescription>
                            The end date of the report period
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
          <CardFooter className='flex justify-between'>
            <Button variant='outline' asChild>
              <Link href='/resources/physical-resources/reports'>Cancel</Link>
            </Button>
            {resources.length > 0 && (
              <Button
                type='submit'
                form='report-form'
                disabled={submitting}
                className='ml-auto'
              >
                {submitting ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Generating...
                  </>
                ) : (
                  'Generate Report'
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </ContentLayout>
  );
}
