'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import * as z from 'zod';
import { BeatLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { toast } from 'react-hot-toast';

const supportedPlatforms = ['Web', 'Mobile', 'Both'] as const;
const applicationTypes = ['Internal', 'External'] as const;
const sensitivityLevels = [
  'Public',
  'Internal',
  'Confidential',
  'Restricted'
] as const;
const userRoles = ['Student', 'Faculty', 'Administrator', 'Staff'] as const;

const apiEndpointSchema = z.object({
  name: z.string().min(2, 'API name must be at least 2 characters'),
  endpoint: z.string().url('Must be a valid URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  description: z.string().optional()
});

const applicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  url: z.string().url('Must be a valid URL'),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().min(1, 'Subcategory is required'),
  integration_type: z.enum(['Direct Link', 'Embedded', 'API Integration']),
  authentication_method: z.enum(['SSO', 'Separate Login', 'No Authentication']),
  display_order: z.number().int().min(0),
  is_active: z.boolean(),
  tags: z.string(),
  access_permissions: z
    .array(z.enum(userRoles))
    .min(1, 'Select at least one role'),
  support_contact: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Must be a valid email'),
    phone: z.string().optional()
  }),
  supported_platforms: z.enum(supportedPlatforms),
  application_type: z.enum(applicationTypes),
  data_sensitivity_level: z.enum(sensitivityLevels),
  api_endpoints: z.array(apiEndpointSchema).optional()
});

const categories = [
  { value: 'core', label: 'Core Systems' },
  { value: 'academic', label: 'Academic' },
  { value: 'admin', label: 'Administrative' },
  { value: 'support', label: 'Support' }
];

const subcategories = {
  core: ['Student Portal', 'Staff Portal', 'Finance'],
  academic: ['Course Management', 'Library', 'Research'],
  admin: ['HR', 'Facilities', 'IT Services'],
  support: ['Help Desk', 'Training', 'Documentation']
};

type FormValues = z.infer<typeof applicationSchema>;

export default function EditApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      name: '',
      description: '',
      url: '',
      category: '',
      subcategory: '',
      integration_type: 'Direct Link',
      authentication_method: 'SSO',
      display_order: 0,
      is_active: true,
      tags: '',
      access_permissions: [],
      support_contact: {
        name: '',
        email: '',
        phone: ''
      },
      supported_platforms: 'Web',
      application_type: 'Internal',
      data_sensitivity_level: 'Internal',
      api_endpoints: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'api_endpoints'
  });

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('applications')
          .select('*')
          .eq('id', params.id)
          .single();

        if (error) throw error;

        if (data) {
          // Transform tags array to string for form
          const tagsString = Array.isArray(data.tags)
            ? data.tags.join(', ')
            : data.tags;

          // Set form values
          form.reset({
            ...data,
            tags: tagsString
          });

          setSelectedCategory(data.category);
        }
      } catch (error) {
        console.error('Error fetching application:', error);
        toast.error('Failed to load application');
        router.push('/applications');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApplication();
  }, [params.id, supabase, form, router]);

  const onSubmit = async (data: FormValues) => {
    try {
      const tagsArray = data.tags.split(',').map((tag) => tag.trim());

      const { error } = await supabase
        .from('applications')
        .update({
          ...data,
          tags: tagsArray,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id);

      if (error) throw error;

      toast.success('Application updated successfully');
      router.push(`/applications/${params.id}`);
    } catch (error) {
      console.error('Error updating application:', error);
      toast.error('Failed to update application');
    }
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    form.setValue('category', value);
    form.setValue('subcategory', '');
  };

  if (isLoading) {
    return (
      <ContentLayout title='Edit Application'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/applications/${params.id}`}>Details</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='container mx-auto py-6'>
        <div className='flex items-center justify-between mb-6'>
          <Button variant='ghost' asChild className='gap-2'>
            <Link href={`/applications/${params.id}`}>
              <ArrowLeft className='h-4 w-4' />
              Back to Details
            </Link>
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Update the basic details of the application
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='Enter application name'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Describe the application'
                          className='min-h-[100px]'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='url'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application URL</FormLabel>
                      <FormControl>
                        <Input placeholder='https://' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <FormField
                    control={form.control}
                    name='category'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={handleCategoryChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select category' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem
                                key={category.value}
                                value={category.value}
                              >
                                {category.label}
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
                    name='subcategory'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subcategory</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!selectedCategory}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select subcategory' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedCategory &&
                              subcategories[
                                selectedCategory as keyof typeof subcategories
                              ].map((sub) => (
                                <SelectItem key={sub} value={sub.toLowerCase()}>
                                  {sub}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <FormField
                    control={form.control}
                    name='integration_type'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Integration Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='Direct Link'>
                              Direct Link
                            </SelectItem>
                            <SelectItem value='Embedded'>Embedded</SelectItem>
                            <SelectItem value='API Integration'>
                              API Integration
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='authentication_method'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authentication Method</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='SSO'>Single Sign-On</SelectItem>
                            <SelectItem value='Separate Login'>
                              Separate Login
                            </SelectItem>
                            <SelectItem value='No Authentication'>
                              No Authentication
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Access Control */}
            <Card>
              <CardHeader>
                <CardTitle>Access Control</CardTitle>
                <CardDescription>
                  Configure who can access this application
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <FormField
                  control={form.control}
                  name='access_permissions'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Permissions</FormLabel>
                      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                        {userRoles.map((role) => (
                          <div
                            key={role}
                            className='flex items-center space-x-2'
                          >
                            <Checkbox
                              checked={field.value?.includes(role)}
                              onCheckedChange={(checked) => {
                                const updatedRoles = checked
                                  ? [...field.value, role]
                                  : field.value?.filter((r) => r !== role);
                                field.onChange(updatedRoles);
                              }}
                            />
                            <Label>{role}</Label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <FormField
                    control={form.control}
                    name='supported_platforms'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supported Platforms</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {supportedPlatforms.map((platform) => (
                              <SelectItem key={platform} value={platform}>
                                {platform}
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
                    name='application_type'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Application Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {applicationTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
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
                    name='data_sensitivity_level'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Sensitivity Level</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sensitivityLevels.map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Determines the level of data protection required
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name='display_order'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Lower numbers appear first
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='tags'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='Enter tags separated by commas'
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Example: academic, student, core
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='is_active'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-base'>
                          Active Status
                        </FormLabel>
                        <FormDescription>
                          Enable or disable the application
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Support Contact */}
            <Card>
              <CardHeader>
                <CardTitle>Support Contact</CardTitle>
                <CardDescription>
                  Contact information for application support
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <FormField
                    control={form.control}
                    name='support_contact.name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Support contact name'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='support_contact.email'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input placeholder='support@example.com' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name='support_contact.phone'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder='Phone number' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* API Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle>API Endpoints</CardTitle>
                <CardDescription>
                  Configure API endpoints for the application
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className='grid gap-4 p-4 border rounded-lg relative'
                  >
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='absolute top-2 right-2'
                      onClick={() => remove(index)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <FormField
                        control={form.control}
                        name={`api_endpoints.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`api_endpoints.${index}.method`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Method</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(
                                  (method) => (
                                    <SelectItem key={method} value={method}>
                                      {method}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`api_endpoints.${index}.endpoint`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endpoint URL</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`api_endpoints.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}

                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={() =>
                    append({
                      name: '',
                      endpoint: '',
                      method: 'GET',
                      description: ''
                    })
                  }
                >
                  <Plus className='mr-2 h-4 w-4' />
                  Add API Endpoint
                </Button>
              </CardContent>
            </Card>

            {/* Form Actions */}
            <div className='flex flex-col md:flex-row justify-end space-y-2 md:space-y-0 md:space-x-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.push(`/applications/${params.id}`)}
              >
                Cancel
              </Button>
              <Button type='submit'>Save Changes</Button>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
