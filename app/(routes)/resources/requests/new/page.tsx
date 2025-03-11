'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';

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
import { ContentLayout } from '@/components/layout/content-layout';
import { useResourceRequests } from '@/hooks/resource/use-resource-requests';
import { useAuth } from '@/hooks/use-auth';

const formSchema = z.object({
  resource_type: z.enum(['equipment', 'facility', 'vehicle', 'other'], {
    required_error: 'Please select a resource type'
  }),
  justification: z
    .string()
    .min(10, { message: 'Justification must be at least 10 characters' })
    .max(500, { message: 'Justification must not exceed 500 characters' }),
  specifications: z.string().optional(),
  estimated_cost: z
    .string()
    .optional()
    .refine(
      (val) => !val || !isNaN(parseFloat(val)),
      'Estimated cost must be a valid number'
    ),
  priority: z.enum(['low', 'medium', 'high'], {
    required_error: 'Please select a priority level'
  }),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

export default function NewResourceRequestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { createRequest } = useResourceRequests();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resource_type: 'equipment',
      justification: '',
      specifications: '',
      estimated_cost: '',
      priority: 'medium',
      notes: ''
    }
  });

  const onSubmit = async (data: FormValues) => {
    if (!user?.id) {
      toast.error('You must be logged in to create a request');
      return;
    }

    setIsSubmitting(true);

    try {
      const requestData = {
        requester_id: user.id,
        resource_type: data.resource_type,
        justification: data.justification,
        specifications: data.specifications
          ? { details: data.specifications }
          : undefined,
        estimated_cost: data.estimated_cost
          ? parseFloat(data.estimated_cost)
          : undefined,
        priority: data.priority,
        notes: data.notes
      };

      const success = await createRequest(requestData);

      if (success) {
        toast.success('Resource request created successfully');
        router.push('/resources/requests');
      }
    } catch (error) {
      console.error('Error creating resource request:', error);
      toast.error('Failed to create resource request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='New Resource Request'>
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
              <Link href='/resources'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/requests'>Resource Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Request</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-4 space-y-6'>
        <div className='flex items-center'>
          <Button variant='ghost' size='sm' className='gap-1' asChild>
            <Link href='/resources/requests'>
              <ArrowLeft className='h-4 w-4' />
              Back to Requests
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Resource Request</CardTitle>
            <CardDescription>
              Submit a request for a new resource or equipment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                id='resource-request-form'
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='resource_type'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resource Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isSubmitting}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select resource type' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='equipment'>Equipment</SelectItem>
                            <SelectItem value='facility'>Facility</SelectItem>
                            <SelectItem value='vehicle'>Vehicle</SelectItem>
                            <SelectItem value='other'>Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the type of resource you are requesting
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='priority'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isSubmitting}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select priority level' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='low'>Low</SelectItem>
                            <SelectItem value='medium'>Medium</SelectItem>
                            <SelectItem value='high'>High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Indicate the urgency of this request
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='estimated_cost'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Cost (Optional)</FormLabel>
                        <FormControl>
                          <div className='relative'>
                            <span className='absolute left-3 top-2.5'>$</span>
                            <Input
                              placeholder='0.00'
                              className='pl-7'
                              {...field}
                              disabled={isSubmitting}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Approximate cost of the requested resource
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name='justification'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Justification</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Explain why this resource is needed and how it will be used'
                          className='min-h-[120px]'
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide a clear justification for this resource request
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='specifications'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specifications (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Provide details about the specifications or requirements'
                          className='min-h-[100px]'
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        Include any specific requirements or specifications
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='notes'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Any additional information or notes'
                          className='min-h-[80px]'
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        Add any other relevant information
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </CardContent>
          <CardFooter className='flex justify-between'>
            <Button
              variant='outline'
              onClick={() => router.push('/resources/requests')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              form='resource-request-form'
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </ContentLayout>
  );
}
