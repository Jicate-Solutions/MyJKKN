// app/(routes)/applications/_components/application-form.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { ApplicationService } from '@/lib/services/application/application-service';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Application } from '@/types/applications';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { SupportContactField } from './support-contact-field';
import { ApiEndpointField } from './api-endpoint-field';
import { CategoryService } from '@/lib/services/application/category-service';
import { StorageUtils } from '@/lib/supabase/storage-utils';
import Image from 'next/image';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';

// Add this type inside your component
type CategoryOption = {
  label: string;
  value: string;
  subcategories: { label: string; value: string }[];
};

// Add max file sizes
const MAX_ICON_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB

// Form schema
const applicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  url: z
    .string()
    .url('Must be a valid URL')
    .startsWith('https://', 'URL must start with https://'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .nullable(),
  category_id: z.string().min(1, 'Category is required'),
  subcategory_id: z.string().optional(),
  roles_access: z
    .array(z.string())
    .min(1, 'At least one role must be selected'),
  display_order: z.number().int().min(0),
  is_active: z.boolean(),
  integration_type: z.enum(['direct_link', 'embedded', 'api']),
  auth_method: z.enum(['sso', 'separate_login', 'none']),
  tags: z.array(z.string()),
  support_contact: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      email: z.string().email('Must be a valid email'),
      phone: z.string().nullable()
    })
    .nullable(),
  supported_platforms: z.enum(['web', 'mobile', 'both']),
  api_endpoints: z
    .array(
      z.object({
        name: z.string().min(2, 'Name must be at least 2 characters'),
        url: z.string().url('Must be a valid URL'),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        description: z.string().nullable(),
        is_active: z.boolean()
      })
    )
    .default([]),
  application_type: z.enum(['internal', 'external']),
  data_sensitivity: z.enum(['public', 'restricted', 'confidential']),
  icon_path: z.string().nullable(),
  screenshots: z.array(z.string()).nullable()
});

type FormValues = z.infer<typeof applicationSchema>;

interface ApplicationFormProps {
  initialData?: Application;
  isEditing?: boolean;
}

export function ApplicationForm({
  initialData,
  isEditing
}: ApplicationFormProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add states for roles
  const [roles, setRoles] = useState<{ key: string; name: string }[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  // Add state for file uploads
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [iconPreview, setIconPreview] = useState<string | null>(
    initialData?.icon_path || null
  );
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>(
    initialData?.screenshots || []
  );
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Add useEffect for initial category selection
  useEffect(() => {
    if (initialData) {
      setSelectedCategory(initialData.category_id);
    }
  }, [initialData]);

  // Fetch categories when component mounts
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true);
        const data = await CategoryService.getCategories();
        const formattedCategories = data.map((category) => ({
          label: category.name,
          value: category.id,
          subcategories: category.subcategories.map((sub) => ({
            label: sub.name,
            value: sub.id
          }))
        }));
        setCategories(formattedCategories);

        // If we have initial data, pre-select the category
        if (initialData?.category_id) {
          setSelectedCategory(initialData.category_id);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast.error('Failed to load categories');
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [initialData]);

  // Add useEffect for fetching roles
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setLoadingRoles(true);
        const availableRoles = await ApplicationService.getAvailableRoles();
        setRoles(availableRoles);
      } catch (error) {
        console.error('Error fetching roles:', error);
        toast.error('Failed to load roles');
      } finally {
        setLoadingRoles(false);
      }
    };

    fetchRoles();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      name: initialData?.name || '',
      url: initialData?.url || 'https://',
      description: initialData?.description || null,
      category_id: initialData?.category_id || '',
      subcategory_id: initialData?.subcategory_id || '',
      roles_access: initialData?.roles_access || [],
      display_order: initialData?.display_order || 0,
      is_active: initialData?.is_active ?? true,
      integration_type: initialData?.integration_type || 'direct_link',
      auth_method: initialData?.auth_method || 'sso',
      tags: initialData?.tags || [],
      support_contact: initialData?.support_contact || {
        name: '',
        email: '',
        phone: null
      },
      supported_platforms: initialData?.supported_platforms || 'web',
      api_endpoints: initialData?.api_endpoints || [],
      application_type: initialData?.application_type || 'internal',
      data_sensitivity: initialData?.data_sensitivity || 'restricted',
      icon_path: initialData?.icon_path || null,
      screenshots: initialData?.screenshots || null
    }
  });

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    form.setValue('subcategory_id', ''); // Reset subcategory when category changes
  };

  const isLoading = form.formState.isSubmitting;

  // Add file upload handlers
  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file size
    if (file.size > MAX_ICON_SIZE) {
      toast.error('Icon file is too large. Maximum size is 2MB.');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file for the icon.');
      return;
    }

    setIconFile(file);

    // Create a preview URL
    const previewUrl = URL.createObjectURL(file);
    setIconPreview(previewUrl);
  };

  const handleScreenshotsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Convert FileList to array
    const fileArray = Array.from(files);

    // Validate file sizes and types
    const validFiles = fileArray.filter((file) => {
      if (file.size > MAX_SCREENSHOT_SIZE) {
        toast.error(`File ${file.name} is too large. Maximum size is 5MB.`);
        return false;
      }

      if (!file.type.startsWith('image/')) {
        toast.error(`File ${file.name} is not an image.`);
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) return;

    // Add new files to existing files
    setScreenshotFiles((prev) => [...prev, ...validFiles]);

    // Create preview URLs
    const newPreviews = validFiles.map((file) => URL.createObjectURL(file));
    setScreenshotPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeScreenshot = (index: number) => {
    // Remove from previews and files
    setScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
    setScreenshotFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeIcon = () => {
    setIconFile(null);
    setIconPreview(null);
    form.setValue('icon_path', null);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);
      setError(null);
      setUploadingFiles(true);

      // Upload icon if exists
      let iconPath = values.icon_path;
      if (iconFile) {
        iconPath = await StorageUtils.uploadFile(
          'applications',
          iconFile,
          'icons'
        );
      }

      // Upload screenshots if exist
      let screenshotPaths = values.screenshots || [];
      if (screenshotFiles.length > 0) {
        const uploadedScreenshots = await StorageUtils.uploadMultipleFiles(
          'applications',
          screenshotFiles,
          'screenshots'
        );

        // If editing, append new screenshots to existing ones
        if (isEditing && initialData?.screenshots) {
          screenshotPaths = [
            ...initialData.screenshots,
            ...uploadedScreenshots
          ];
        } else {
          screenshotPaths = uploadedScreenshots;
        }
      }

      const dataWithImages = {
        ...values,
        icon_path: iconPath,
        screenshots: screenshotPaths,
        subcategory_id: values.subcategory_id || null,
        description: values.description || null,
        support_contact: values.support_contact || null
      };

      if (isEditing && initialData) {
        await ApplicationService.updateApplication(
          initialData.id,
          dataWithImages
        );
      } else {
        await ApplicationService.createApplication(dataWithImages);
      }

      router.push('/applications');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error('Failed to save application');
    } finally {
      setIsSubmitting(false);
      setUploadingFiles(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='space-y-8 max-w-5xl mx-auto'
      >
        {/* Basic Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Enter the core details of your application
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter application name' {...field} />
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
                      <Input placeholder='https://example.com' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the application's purpose and functionality"
                      className='h-24'
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Classification Card */}
        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
            <CardDescription>
              Categorize and organize your application
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='category_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      disabled={loadingCategories}
                      onValueChange={(value) => {
                        field.onChange(value);
                        handleCategoryChange(value);
                      }}
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
                name='subcategory_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategory</FormLabel>
                    <Select
                      disabled={!selectedCategory}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select subcategory' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedCategory &&
                          categories
                            .find((cat) => cat.value === selectedCategory)
                            ?.subcategories.map((sub) => (
                              <SelectItem key={sub.value} value={sub.value}>
                                {sub.label}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Access Control Card */}
        <Card>
          <CardHeader>
            <CardTitle>Access Control</CardTitle>
            <CardDescription>
              Configure access and security settings
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <FormField
              control={form.control}
              name='roles_access'
              render={() => (
                <FormItem className='space-y-4'>
                  <FormLabel>Roles with Access</FormLabel>
                  {loadingRoles ? (
                    <div className='p-4 text-center text-muted-foreground'>
                      Loading roles...
                    </div>
                  ) : (
                    <div className='grid grid-cols-2 gap-4'>
                      {roles.map((role) => (
                        <div
                          key={role.key}
                          className='flex items-center space-x-2 bg-secondary/20 p-2 rounded-md'
                        >
                          <Checkbox
                            checked={form
                              .watch('roles_access')
                              .includes(role.key)}
                            onCheckedChange={(checked) => {
                              const current = form.watch('roles_access');
                              const updated = checked
                                ? [...current, role.key]
                                : current.filter((r) => r !== role.key);
                              form.setValue('roles_access', updated);
                            }}
                          />
                          <label className='text-sm font-medium'>
                            {role.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Technical Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Configuration</CardTitle>
            <CardDescription>
              Set up technical aspects of the application
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
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
                          <SelectValue placeholder='Select integration type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ApplicationService.getIntegrationTypes().map(
                          (type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='auth_method'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authentication Method</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select auth method' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ApplicationService.getAuthMethods().map((method) => (
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
          </CardContent>
        </Card>

        {/* Additional Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Settings</CardTitle>
            <CardDescription>
              Configure advanced settings and metadata
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              {/* Display Order */}
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
                      Order in which the application appears (lower numbers
                      appear first)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tags */}
              <FormField
                control={form.control}
                name='tags'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <div className='space-y-2'>
                      <FormControl>
                        <div className='space-y-2'>
                          <Input
                            placeholder='Type a tag and press Enter'
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const input = e.currentTarget;
                                const newTag = input.value.trim();
                                if (newTag && !field.value?.includes(newTag)) {
                                  const updatedTags = [
                                    ...(field.value || []),
                                    newTag
                                  ];
                                  field.onChange(updatedTags);
                                  input.value = '';
                                }
                              }
                            }}
                          />
                          <div className='flex flex-wrap gap-2'>
                            {field.value?.map((tag, index) => (
                              <Badge
                                key={index}
                                variant='secondary'
                                className='flex items-center gap-1'
                              >
                                {tag}
                                <button
                                  type='button'
                                  onClick={() => {
                                    const updatedTags = field.value?.filter(
                                      (_, i) => i !== index
                                    );
                                    field.onChange(updatedTags);
                                  }}
                                  className='ml-1 hover:text-destructive focus:outline-none'
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Type a tag and press Enter to add it. Click × to remove
                        a tag.
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              {/* Supported Platforms */}
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
                          <SelectValue placeholder='Select supported platforms' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='web'>Web Only</SelectItem>
                        <SelectItem value='mobile'>Mobile Only</SelectItem>
                        <SelectItem value='both'>Web & Mobile</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Specify which platforms this application supports
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Application Type */}
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
                          <SelectValue placeholder='Select application type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='internal'>Internal</SelectItem>
                        <SelectItem value='external'>External</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Specify whether this is an internal or external
                      application
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Data Sensitivity Level */}
              <FormField
                control={form.control}
                name='data_sensitivity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Sensitivity Level</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select sensitivity level' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='public'>Public</SelectItem>
                        <SelectItem value='restricted'>Restricted</SelectItem>
                        <SelectItem value='confidential'>
                          Confidential
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Specify the data sensitivity level for this application
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Support Contact Card */}
        <Card>
          <CardHeader>
            <CardTitle>Support Contact</CardTitle>
            <CardDescription>
              Add contact details for application support
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupportContactField />
          </CardContent>
        </Card>

        {/* API Endpoints Card */}
        <Card>
          <CardHeader>
            <CardTitle>API Endpoints</CardTitle>
            <CardDescription>
              Configure API endpoints for this application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiEndpointField />
          </CardContent>
        </Card>

        {/* Application Media */}
        <Card>
          <CardHeader>
            <CardTitle>Application Media</CardTitle>
            <CardDescription>
              Upload application icon and screenshots
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              {/* Icon Upload */}
              <div className='space-y-2'>
                <FormLabel>Application Icon</FormLabel>
                <div className='flex flex-col gap-4'>
                  {iconPreview ? (
                    <div className='relative w-28 h-28 border rounded-md overflow-hidden'>
                      <Image
                        src={iconPreview}
                        alt='Application Icon'
                        fill
                        className='object-cover'
                      />
                      <button
                        type='button'
                        onClick={removeIcon}
                        className='absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1'
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className='flex items-center justify-center w-28 h-28 border border-dashed rounded-md bg-muted'>
                      <ImageIcon className='text-muted-foreground' size={32} />
                    </div>
                  )}
                  <div>
                    <Label htmlFor='icon-upload' className='cursor-pointer'>
                      <div className='flex items-center gap-1 text-sm text-primary'>
                        <Upload size={16} />
                        {iconPreview ? 'Change Icon' : 'Upload Icon'}
                      </div>
                    </Label>
                    <Input
                      id='icon-upload'
                      type='file'
                      className='hidden'
                      accept='image/*'
                      onChange={handleIconUpload}
                    />
                    <p className='text-xs text-muted-foreground mt-1'>
                      Recommended size: 512×512px. Max 2MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Screenshots Upload */}
              <div className='space-y-2'>
                <FormLabel>Application Screenshots</FormLabel>
                <div className='space-y-4'>
                  {screenshotPreviews.length > 0 && (
                    <div className='grid grid-cols-3 gap-2'>
                      {screenshotPreviews.map((preview, index) => (
                        <div
                          key={index}
                          className='relative aspect-video border rounded-md overflow-hidden'
                        >
                          <Image
                            src={preview}
                            alt={`Screenshot ${index + 1}`}
                            fill
                            className='object-cover'
                          />
                          <button
                            type='button'
                            onClick={() => removeScreenshot(index)}
                            className='absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1'
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <Label
                      htmlFor='screenshots-upload'
                      className='cursor-pointer'
                    >
                      <div className='flex items-center gap-1 text-sm text-primary'>
                        <Upload size={16} />
                        {screenshotPreviews.length > 0
                          ? 'Add More Screenshots'
                          : 'Upload Screenshots'}
                      </div>
                    </Label>
                    <Input
                      id='screenshots-upload'
                      type='file'
                      className='hidden'
                      accept='image/*'
                      multiple
                      onChange={handleScreenshotsUpload}
                    />
                    <p className='text-xs text-muted-foreground mt-1'>
                      Max 5 screenshots. Max 5MB each.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Status */}
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
                <FormLabel>Active Status</FormLabel>
                <FormDescription>
                  Enable or disable application access
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Submit Buttons */}
        <div className='flex justify-end space-x-4 pt-6'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting || uploadingFiles}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting || uploadingFiles}>
            {isSubmitting || uploadingFiles
              ? 'Saving...'
              : isEditing
              ? 'Update Application'
              : 'Create Application'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
