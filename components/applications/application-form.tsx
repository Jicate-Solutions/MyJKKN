// components/applications/application-form.tsx
'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  ApplicationFormData,
  IntegrationType,
  AuthenticationMethod,
  SupportedPlatform,
  ApplicationType,
  SensitivityLevel,
  HttpMethod
} from '@/types/applications';
import { Badge } from '@/components/ui/badge';

// Form validation schema
const applicationFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  url: z.string().url('Must be a valid URL'),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().min(1, 'Subcategory is required'),
  integration_type: z.nativeEnum(IntegrationType),
  authentication_method: z.nativeEnum(AuthenticationMethod),
  display_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
  tags: z.array(z.string()).min(1, 'At least one tag is required'),
  access_permissions: z
    .array(z.string())
    .min(1, 'At least one permission is required'),
  support_contact: z.object({
    name: z.string().min(2, 'Contact name is required'),
    email: z.string().email('Must be a valid email'),
    phone: z.string().optional()
  }),
  supported_platforms: z.nativeEnum(SupportedPlatform),
  application_type: z.nativeEnum(ApplicationType),
  data_sensitivity_level: z.nativeEnum(SensitivityLevel),
  api_endpoints: z
    .array(
      z.object({
        name: z.string().min(2, 'Endpoint name is required'),
        endpoint: z.string().url('Must be a valid URL'),
        method: z.nativeEnum(HttpMethod),
        description: z.string().optional()
      })
    )
    .optional()
});

interface ApplicationFormProps {
  initialData?: ApplicationFormData;
  onSubmit: (data: ApplicationFormData) => Promise<void>;
  isLoading: boolean;
}

export function ApplicationForm({
  initialData,
  onSubmit,
  isLoading
}: ApplicationFormProps) {
  const form = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationFormSchema),
    defaultValues: {
      name: '',
      description: '',
      url: '',
      category: '',
      subcategory: '',
      integration_type: IntegrationType.DirectLink,
      authentication_method: AuthenticationMethod.SSO,
      display_order: 0,
      is_active: true,
      tags: [],
      access_permissions: [],
      support_contact: {
        name: '',
        email: '',
        phone: ''
      },
      supported_platforms: SupportedPlatform.Web,
      application_type: ApplicationType.Internal,
      data_sensitivity_level: SensitivityLevel.Internal,
      api_endpoints: [],
      ...initialData
    }
  });

  const {
    fields: apiEndpoints,
    append: appendEndpoint,
    remove: removeEndpoint
  } = useFieldArray({
    control: form.control,
    name: 'api_endpoints'
  });

  // Helper function for tags input
  const handleTagInput = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.key === 'Enter' && input.value) {
      event.preventDefault();
      const currentTags = form.getValues('tags');
      const newTag = input.value.trim();
      if (newTag && !currentTags.includes(newTag)) {
        form.setValue('tags', [...currentTags, newTag]);
        input.value = '';
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        {/* Basic Information */}
        <div className='space-y-4'>
          <h3 className='text-lg font-medium'>Basic Information</h3>

          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder='Application name' {...field} />
                </FormControl>
                <FormDescription>
                  Name of the application as it will appear in the dashboard
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
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder='Describe the application...'
                    className='resize-none'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Brief description of what the application does
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='url'
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL</FormLabel>
                <FormControl>
                  <Input placeholder='https://' {...field} />
                </FormControl>
                <FormDescription>
                  The web address where users can access the application
                </FormDescription>
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
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select category' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='core'>Core Systems</SelectItem>
                      <SelectItem value='academic'>Academic</SelectItem>
                      <SelectItem value='admin'>Administrative</SelectItem>
                      <SelectItem value='support'>Support</SelectItem>
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
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select subcategory' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Dynamic subcategories based on selected category */}
                      <SelectItem value='student-portal'>
                        Student Portal
                      </SelectItem>
                      <SelectItem value='staff-portal'>Staff Portal</SelectItem>
                      <SelectItem value='finance'>Finance</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Tags Input */}
          <FormField
            control={form.control}
            name='tags'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <FormControl>
                  <div className='space-y-2'>
                    <Input
                      placeholder='Add tags (press Enter)'
                      onKeyDown={handleTagInput}
                    />
                    <div className='flex flex-wrap gap-2'>
                      {field.value.map((tag, index) => (
                        <Badge
                          key={index}
                          variant='secondary'
                          className='cursor-pointer'
                          onClick={() => {
                            const newTags = [...field.value];
                            newTags.splice(index, 1);
                            form.setValue('tags', newTags);
                          }}
                        >
                          {tag}
                          <Trash2 className='ml-1 h-3 w-3' />
                        </Badge>
                      ))}
                    </div>
                  </div>
                </FormControl>
                <FormDescription>
                  Add relevant tags to help users find this application
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Technical Settings */}
        <div className='space-y-4'>
          <h3 className='text-lg font-medium'>Technical Settings</h3>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <FormField
              control={form.control}
              name='integration_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Integration Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(IntegrationType).map((type) => (
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
              name='authentication_method'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Authentication Method</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(AuthenticationMethod).map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <FormField
              control={form.control}
              name='supported_platforms'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supported Platforms</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(SupportedPlatform).map((platform) => (
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
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(ApplicationType).map((type) => (
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
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(SensitivityLevel).map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Lower numbers appear first in the list
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Support Contact */}
        <div className='space-y-4'>
          <h3 className='text-lg font-medium'>Support Contact</h3>

          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='support_contact.name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                    <Input type='email' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='support_contact.phone'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Phone (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* API Endpoints */}
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-lg font-medium'>API Endpoints</h3>
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                appendEndpoint({
                  name: '',
                  endpoint: '',
                  method: HttpMethod.GET,
                  description: ''
                })
              }
            >
              <Plus className='mr-2 h-4 w-4' />
              Add Endpoint
            </Button>
          </div>

          {apiEndpoints.map((field, index) => (
            <div key={field.id} className='p-4 border rounded-lg space-y-4'>
              <div className='flex justify-between items-start'>
                <h4 className='text-sm font-medium'>Endpoint {index + 1}</h4>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => removeEndpoint(index)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name={`api_endpoints.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
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
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(HttpMethod).map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
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
                      <Textarea {...field} className='resize-none' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        {/* Active Status */}
        <FormField
          control={form.control}
          name='is_active'
          render={({ field }) => (
            <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <FormLabel className='text-base'>Active Status</FormLabel>
                <FormDescription>
                  Disable to hide this application from users
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

        {/* Form Actions */}
        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => window.history.back()}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isLoading}>
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {initialData ? 'Update Application' : 'Create Application'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
