'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, InfoIcon } from 'lucide-react';
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
import { DatePicker } from '@/components/ui/date-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'react-hot-toast';
import { DigitalResourceService } from '@/lib/services/resource/digital/digital-resource-service';
import { useDigitalReports } from '@/hooks/resource/digital/use-digital-reports';
import { GenerateDigitalUsageReportDto } from '@/types/digital-resources';

// Form schema
const formSchema = z
  .object({
    digitalResourceId: z.string({
      required_error: 'Please select a digital resource'
    }),
    startDate: z.date({
      required_error: 'Start date is required'
    }),
    endDate: z
      .date({
        required_error: 'End date is required'
      })
      .refine((date) => date >= new Date(Date.now() - 86400000), {
        message: 'End date cannot be in the past'
      }),
    reportType: z.enum(['standard', 'detailed'], {
      required_error: 'Please select a report type'
    })
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate']
  });

type FormValues = z.infer<typeof formSchema>;

export default function NewReportPage() {
  const router = useRouter();
  const [resources, setResources] = useState<
    { id: string; digital_resource_name: string }[]
  >([]);
  const [loadingResources, setLoadingResources] = useState(true);

  // Use the digital reports hook
  const { generateReport, isGeneratingReport } = useDigitalReports();

  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      startDate: new Date(Date.now() - 30 * 86400000), // 30 days ago
      endDate: new Date(),
      reportType: 'standard'
    }
  });

  // Fetch digital resources
  useEffect(() => {
    const fetchResources = async () => {
      try {
        setLoadingResources(true);
        const response = await DigitalResourceService.getDigitalResources();
        setResources(response.data);
      } catch (error) {
        console.error('Error fetching resources:', error);
        toast.error('Failed to load digital resources');
      } finally {
        setLoadingResources(false);
      }
    };

    fetchResources();
  }, []);

  const onSubmit = async (values: FormValues) => {
    try {
      await generateReport(values as GenerateDigitalUsageReportDto);
      router.push('/resources/digital-resources/reports');
    } catch (error) {
      console.error('Error generating report:', error);
      // Error handling is done in the hook
    }
  };

  return (
    <ContentLayout title='Generate New Usage Report'>
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources/reports'>
                Usage Reports
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Generate New Report</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6'>
        <Card>
          <CardHeader>
            <CardTitle className='text-xl'>Generate New Usage Report</CardTitle>
            <CardDescription>
              Create a new report to analyze digital resource usage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className='mb-6'>
              <InfoIcon className='h-4 w-4' />
              <AlertTitle>Report Generation Info</AlertTitle>
              <AlertDescription>
                Reports may take a few minutes to generate depending on the date
                range and resource. You can view the status of your report in
                the reports list.
              </AlertDescription>
            </Alert>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <FormField
                  control={form.control}
                  name='digitalResourceId'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Digital Resource</FormLabel>
                      <Select
                        disabled={loadingResources || isGeneratingReport}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                loadingResources
                                  ? 'Loading resources...'
                                  : 'Select a digital resource'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {loadingResources ? (
                            <div className='flex items-center justify-center p-2'>
                              <Loader2 className='h-4 w-4 animate-spin mr-2' />
                              <span>Loading resources...</span>
                            </div>
                          ) : (
                            resources.map((resource) => (
                              <SelectItem key={resource.id} value={resource.id}>
                                {resource.digital_resource_name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the digital resource to generate a usage report
                        for
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <FormField
                    control={form.control}
                    name='startDate'
                    render={({ field }) => (
                      <FormItem className='flex flex-col'>
                        <FormLabel>Start Date</FormLabel>
                        <DatePicker
                          date={field.value}
                          setDate={field.onChange}
                        />
                        <FormDescription>
                          The start date of the report period
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='endDate'
                    render={({ field }) => (
                      <FormItem className='flex flex-col'>
                        <FormLabel>End Date</FormLabel>
                        <DatePicker
                          date={field.value}
                          setDate={field.onChange}
                        />
                        <FormDescription>
                          The end date of the report period
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name='reportType'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Report Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isGeneratingReport}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select a report type' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='standard'>
                            Standard (Usage Summary)
                          </SelectItem>
                          <SelectItem value='detailed'>
                            Detailed (Full Analysis)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Standard reports provide basic usage statistics, while
                        detailed reports include additional analytics and
                        visualizations
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='flex justify-end gap-3'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() =>
                      router.push('/resources/digital-resources/reports')
                    }
                    disabled={isGeneratingReport}
                  >
                    Cancel
                  </Button>
                  <Button
                    type='submit'
                    disabled={isGeneratingReport || loadingResources}
                  >
                    {isGeneratingReport ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        Generating...
                      </>
                    ) : (
                      'Generate Report'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
