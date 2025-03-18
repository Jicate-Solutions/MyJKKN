'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Loader2, Share2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { SharingPolicyService } from '@/lib/services/resource/physical/sharing-policy-service';
import { ResourceCategoryService } from '@/lib/services/resource/physical/resource-category-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { useEffect } from 'react';

// Define the form schema
const formSchema = z.object({
  resource_type_id: z.string().optional(),
  institution_id: z.string().optional(),
  priority_levels: z.object({
    owner_priority: z.coerce.number().int().min(1).max(10),
    same_institution_priority: z.coerce.number().int().min(1).max(10),
    other_institution_priority: z.coerce.number().int().min(1).max(10)
  }),
  approval_required: z.boolean().default(true),
  max_reservation_duration: z.coerce.number().int().positive(),
  advance_notice_required: z.coerce.number().int().min(0),
  cancellation_policy: z.string().optional(),
  pricing_model: z
    .object({
      internal_rate: z.coerce.number().min(0),
      external_rate: z.coerce.number().min(0),
      rate_unit: z.string()
    })
    .optional(),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof formSchema>;

export default function NewSharingPolicyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resourceTypes, setResourceTypes] = useState<
    { id: string; category_name: string }[]
  >([]);
  const [institutions, setInstitutions] = useState<
    { id: string; name: string }[]
  >([]);
  const [hasPricing, setHasPricing] = useState(false);

  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priority_levels: {
        owner_priority: 10,
        same_institution_priority: 5,
        other_institution_priority: 1
      },
      approval_required: true,
      max_reservation_duration: 24,
      advance_notice_required: 1,
      is_active: true,
      pricing_model: {
        internal_rate: 0,
        external_rate: 0,
        rate_unit: 'per_hour'
      }
    }
  });

  // Fetch resource types and institutions
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch resource types
        const resourceTypesResponse =
          await ResourceCategoryService.getResourceCategories();
        setResourceTypes(resourceTypesResponse.data);

        // Fetch institutions
        const institutionsResponse =
          await OrganizationService.getInstitutions();
        setInstitutions(institutionsResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load form data');
      }
    };

    fetchData();
  }, []);

  const onSubmit = async (data: FormValues) => {
    try {
      setLoading(true);

      // Handle special values and optional fields
      const formData = {
        ...data,
        resource_type_id:
          data.resource_type_id === 'all_types'
            ? null
            : data.resource_type_id || null,
        institution_id:
          data.institution_id === 'all_institutions'
            ? null
            : data.institution_id || null,
        pricing_model: hasPricing ? data.pricing_model : undefined
      };

      await SharingPolicyService.createSharingPolicy(formData as any);
      toast.success('Sharing policy created successfully');
      router.push('/resources/physical-resources/policies');
    } catch (error) {
      console.error('Error creating sharing policy:', error);
      toast.error('Failed to create sharing policy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ContentLayout title='Create Sharing Policy'>
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
              <Link href='/resources/physical-resources/policies'>Sharing Policies</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create Policy</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex items-center mt-6 mb-4'>
        <Share2 className='mr-2 h-5 w-5' />
        <h1 className='text-2xl font-bold'>Create New Sharing Policy</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy Details</CardTitle>
          <CardDescription>
            Define how resources can be shared across institutions and
            departments
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <FormField
                  control={form.control}
                  name='resource_type_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select a resource type' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='all_types'>
                            All Resource Types
                          </SelectItem>
                          {resourceTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.category_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Leave blank to apply to all resource types
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select an institution' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='all_institutions'>
                            All Institutions
                          </SelectItem>
                          {institutions.map((institution) => (
                            <SelectItem
                              key={institution.id}
                              value={institution.id}
                            >
                              {institution.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Leave blank to apply to all institutions
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <FormField
                  control={form.control}
                  name='max_reservation_duration'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Reservation Duration (hours)</FormLabel>
                      <FormControl>
                        <Input type='number' min='1' {...field} />
                      </FormControl>
                      <FormDescription>
                        Maximum time a resource can be reserved
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='advance_notice_required'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Advance Notice Required (hours)</FormLabel>
                      <FormControl>
                        <Input type='number' min='0' {...field} />
                      </FormControl>
                      <FormDescription>
                        How far in advance reservations must be made
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='approval_required'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className='space-y-1 leading-none'>
                      <FormLabel>Require Approval</FormLabel>
                      <FormDescription>
                        Reservations will need administrator approval before
                        being confirmed
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <div className='space-y-4 rounded-md border p-4'>
                <h3 className='font-medium'>Priority Levels</h3>
                <p className='text-sm text-muted-foreground'>
                  Set priority levels for different user groups (1-10, higher is
                  more priority)
                </p>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <FormField
                    control={form.control}
                    name='priority_levels.owner_priority'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Priority</FormLabel>
                        <FormControl>
                          <Input type='number' min='1' max='10' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='priority_levels.same_institution_priority'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Same Institution</FormLabel>
                        <FormControl>
                          <Input type='number' min='1' max='10' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='priority_levels.other_institution_priority'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Other Institution</FormLabel>
                        <FormControl>
                          <Input type='number' min='1' max='10' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name='cancellation_policy'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cancellation Policy</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Describe the cancellation policy...'
                        className='resize-none'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional: Describe rules for cancelling reservations
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='space-y-4'>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='pricing'
                    checked={hasPricing}
                    onCheckedChange={(checked) => setHasPricing(!!checked)}
                  />
                  <label
                    htmlFor='pricing'
                    className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                  >
                    Enable Pricing Model
                  </label>
                </div>

                {hasPricing && (
                  <div className='space-y-4 rounded-md border p-4 mt-2'>
                    <h3 className='font-medium'>Pricing Model</h3>
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                      <FormField
                        control={form.control}
                        name='pricing_model.internal_rate'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Internal Rate</FormLabel>
                            <FormControl>
                              <Input
                                type='number'
                                min='0'
                                step='0.01'
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='pricing_model.external_rate'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>External Rate</FormLabel>
                            <FormControl>
                              <Input
                                type='number'
                                min='0'
                                step='0.01'
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='pricing_model.rate_unit'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rate Unit</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder='Select unit' />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value='per_hour'>
                                  Per Hour
                                </SelectItem>
                                <SelectItem value='per_day'>Per Day</SelectItem>
                                <SelectItem value='per_use'>Per Use</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className='space-y-1 leading-none'>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Inactive policies will not be applied to reservations
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className='flex justify-between'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.push('/resources/physical-resources/policies')}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={loading}>
                {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Create Policy
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </ContentLayout>
  );
}
