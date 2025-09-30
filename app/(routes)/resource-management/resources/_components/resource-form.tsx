// app/(routes)/resource-management/resources/_components/resource-form.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useRoles } from '@/hooks/organization/use-roles';
import type {
  Resource,
  CreateResourceDto,
  UpdateResourceDto
} from '@/types/resource-management';
import { resourceSchema } from '@/types/resource-management';
import { useResourceOperations } from '@/hooks/resource-management/use-resources';
import { useParentCategoriesSelect } from '@/hooks/resource-management/use-parent-categories';
import { useSubCategoriesSelect } from '@/hooks/resource-management/use-sub-categories';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useStaff } from '@/hooks/staff/use-staff';
import { SubCategoryService } from '@/lib/services/resource-management/sub-category-service';
import { Loader2, Upload, Trash2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

interface ResourceFormProps {
  resource?: Resource;
  mode: 'create' | 'edit';
}

type FormData = CreateResourceDto | UpdateResourceDto;

export function ResourceForm({ resource, mode }: ResourceFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attributeDefinitions, setAttributeDefinitions] = useState<any[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]); // Store files temporarily until form submission

  const { createResource, updateResource } = useResourceOperations();

  const form = useForm<FormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: resource || {
      name: '',
      description: '',
      parent_category_id: '',
      subcategory_id: '',
      institution_id: '',
      department_id: '',
      building_number: '',
      block_number: '',
      floor_number: '',
      room_number: '',
      location_notes: '',
      vendor_name: '',
      vendor_email: '',
      vendor_mobile: '',
      vendor_address_line1: '',
      vendor_address_line2: '',
      vendor_city: '',
      vendor_state: '',
      vendor_zip: '',
      vendor_contract_details: '',
      vendor_support_contact: '',
      initial_stock_quantity: 1,
      current_stock_quantity: undefined,
      caretaker_user_ids: [],
      purchase_date: '',
      warranty_expiry_date: '',
      maintenance_schedule: '',
      depreciation_rate: undefined,
      current_value: undefined,
      disposal_date: '',
      status: 'available',
      booking_type: 'reservation',
      booking_config: {},
      approval_config: {},
      reminder_config: {},
      access_roles: [],
      custom_attributes: {},
      image_urls: [],
      tags: []
    },
    mode: 'onChange'
  });

  const parentCategoryId = form.watch('parent_category_id');
  const subcategoryId = form.watch('subcategory_id');
  const selectedInstitutionId = form.watch('institution_id');
  const bookingType = form.watch('booking_type');
  const bookingConfig = form.watch('booking_config') || {};
  const approvalConfig = form.watch('approval_config') || {};
  const reminderConfig = form.watch('reminder_config') || {};
  const customAttributes = form.watch('custom_attributes') || {};
  const imageUrls = form.watch('image_urls') || [];

  const { institutions: accessibleInstitutions } = useUserInstitutionAccess();
  const institutionId = accessibleInstitutions[0]?.institution_id;
  const { institutions, loading: loadingInstitutions } =
    useInstitutionsWithAccess();
  const { categories: parentCategories, loading: loadingParent } =
    useParentCategoriesSelect();
  const { categories: subcategories, loading: loadingSubcategories } =
    useSubCategoriesSelect(parentCategoryId);
  const { data: departmentsData, isLoading: loadingDepartments } =
    useDepartments({ institution_id: selectedInstitutionId || institutionId });
  const departments = departmentsData?.data || [];

  // Fetch staff based on selected institution and department for responsible person selection
  const selectedDepartmentId = form.watch('department_id');
  const selectedAccessRoles = form.watch('access_roles') || [];

  // Fetch custom roles for access control
  const { data: customRoles = [], isLoading: loadingRoles } = useRoles({
    includeSystemRoles: true,
    isActive: true
  });

  const {
    data: staffData,
    isLoading: loadingStaff,
    error: staffError
  } = useStaff(
    selectedInstitutionId
      ? {
          institution_id: selectedInstitutionId,
          department_id: selectedDepartmentId || undefined,
          isActive: true,
          limit: 1000 // Get all staff for the institution
        }
      : {
          institution_id: '',
          isActive: true,
          limit: 0 // Don't fetch if no institution
        }
  );
  const staff = staffData?.data || [];

  // Debug logging
  useEffect(() => {
    console.log('Staff Data Debug:', {
      selectedInstitutionId,
      selectedDepartmentId,
      staffData,
      staff,
      loadingStaff,
      staffError
    });
  }, [
    selectedInstitutionId,
    selectedDepartmentId,
    staffData,
    staff,
    loadingStaff,
    staffError
  ]);

  useEffect(() => {
    const fetchAttributeDefinitions = async () => {
      if (!subcategoryId) {
        setAttributeDefinitions([]);
        return;
      }
      try {
        setLoadingAttributes(true);
        const subcategory = await SubCategoryService.getSubCategory(
          subcategoryId
        );
        setAttributeDefinitions(subcategory.attribute_definitions || []);
      } catch (error) {
        console.error('Error fetching attribute definitions:', error);
        setAttributeDefinitions([]);
      } finally {
        setLoadingAttributes(false);
      }
    };
    fetchAttributeDefinitions();
  }, [subcategoryId]);

  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);

      // Upload pending images first
      const uploadedImageUrls: string[] = [...(data.image_urls || [])];

      if (pendingImageFiles.length > 0) {
        toast.loading('Uploading images...', { id: 'upload-images' });

        for (const file of pendingImageFiles) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'resource');
            formData.append('entityId', Date.now().toString());

            const response = await fetch('/api/upload/resource-management', {
              method: 'POST',
              body: formData
            });

            if (!response.ok) throw new Error('Failed to upload image');

            const uploadData = await response.json();
            uploadedImageUrls.push(uploadData.url);
          } catch (uploadError) {
            console.error('Error uploading image:', uploadError);
            toast.error('Failed to upload some images');
          }
        }

        toast.dismiss('upload-images');
        toast.success(
          `${pendingImageFiles.length} image(s) uploaded successfully`
        );
      }

      // Update data with uploaded image URLs
      const finalData = { ...data, image_urls: uploadedImageUrls };

      let result;
      if (mode === 'create') {
        result = await createResource(finalData as CreateResourceDto);
      } else if (resource?.id) {
        result = await updateResource(
          resource.id,
          finalData as UpdateResourceDto
        );
      }

      if (result) {
        setPendingImageFiles([]); // Clear pending files
        await queryClient.invalidateQueries({ queryKey: ['resources'] });
        router.push('/resource-management/resources');
        router.refresh();
      }
    } catch (error) {
      console.error('Error submitting resource:', error);
      toast.error('Failed to save resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = (file: File) => {
    try {
      // Validate file size (5MB limit)
      if (file.size > 5242880) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      // Validate file type
      const validTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
      ];
      if (!validTypes.includes(file.type)) {
        toast.error('Only JPEG, PNG, GIF, and WEBP images are allowed');
        return;
      }

      // Add to pending files (will be uploaded on form submit)
      setPendingImageFiles((prev) => [...prev, file]);
      toast.success('Image added (will be uploaded on save)');
    } catch (error) {
      console.error('Error adding image:', error);
      toast.error('Failed to add image');
    }
  };

  const removeImage = (index: number) => {
    const existingImageCount = (resource?.image_urls || []).length;

    // Check if it's an existing image or a pending one
    if (index < existingImageCount) {
      // Remove from existing image_urls
      const updated = imageUrls.filter((_: string, i: number) => i !== index);
      form.setValue('image_urls', updated);
    } else {
      // Remove from pending files
      const pendingIndex = index - existingImageCount;
      setPendingImageFiles((prev) => prev.filter((_, i) => i !== pendingIndex));
    }
    toast.success('Image removed');
  };

  // Get all images (existing + pending) for display
  const getAllImages = () => {
    const existing = imageUrls || [];
    const pending = pendingImageFiles.map((file) => URL.createObjectURL(file));
    return [...existing, ...pending];
  };

  const updateBookingConfig = (key: string, value: any) => {
    form.setValue('booking_config', { ...bookingConfig, [key]: value });
  };

  const updateApprovalConfig = (key: string, value: any) => {
    form.setValue('approval_config', { ...approvalConfig, [key]: value });
  };

  const updateAttribute = (key: string, value: any) => {
    form.setValue('custom_attributes', { ...customAttributes, [key]: value });
  };

  const renderAttributeInput = (attr: any) => {
    const currentValue = customAttributes[attr.attribute_key];

    switch (attr.attribute_type) {
      case 'text':
        return (
          <Input
            placeholder={attr.description || 'Enter value'}
            value={currentValue || ''}
            onChange={(e) =>
              updateAttribute(attr.attribute_key, e.target.value)
            }
          />
        );
      case 'number':
        return (
          <Input
            type='number'
            placeholder={attr.description || 'Enter number'}
            value={currentValue || ''}
            onChange={(e) =>
              updateAttribute(attr.attribute_key, parseFloat(e.target.value))
            }
          />
        );
      case 'date':
        return (
          <Input
            type='date'
            value={currentValue || ''}
            onChange={(e) =>
              updateAttribute(attr.attribute_key, e.target.value)
            }
          />
        );
      case 'boolean':
        return (
          <div className='flex items-center space-x-2 pt-2'>
            <Checkbox
              id={attr.attribute_key}
              checked={currentValue || false}
              onCheckedChange={(checked) =>
                updateAttribute(attr.attribute_key, checked)
              }
            />
            <Label htmlFor={attr.attribute_key} className='font-normal'>
              {attr.description || 'Yes'}
            </Label>
          </div>
        );
      case 'select':
        return (
          <Select
            value={currentValue || ''}
            onValueChange={(value) =>
              updateAttribute(attr.attribute_key, value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Select option' />
            </SelectTrigger>
            <SelectContent>
              {attr.options?.map((option: string) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'multi_select':
        const selectedValues = Array.isArray(currentValue) ? currentValue : [];
        return (
          <div className='space-y-2'>
            {attr.options?.map((option: string) => (
              <div key={option} className='flex items-center space-x-2'>
                <Checkbox
                  id={`${attr.attribute_key}-${option}`}
                  checked={selectedValues.includes(option)}
                  onCheckedChange={(checked) => {
                    const updated = checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v: string) => v !== option);
                    updateAttribute(attr.attribute_key, updated);
                  }}
                />
                <Label
                  htmlFor={`${attr.attribute_key}-${option}`}
                  className='font-normal'
                >
                  {option}
                </Label>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <Input
            placeholder={attr.description || 'Enter value'}
            value={currentValue || ''}
            onChange={(e) =>
              updateAttribute(attr.attribute_key, e.target.value)
            }
          />
        );
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <h3 className='text-lg font-semibold'>Basic Information</h3>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Resource Name <span className='text-red-500'>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g., Projector - Room 301'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Status <span className='text-red-500'>*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select status' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='available'>Available</SelectItem>
                        <SelectItem value='occupied'>Occupied</SelectItem>
                        <SelectItem value='maintenance'>Maintenance</SelectItem>
                        <SelectItem value='retired'>Retired</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='parent_category_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Category <span className='text-red-500'>*</span>
                    </FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('subcategory_id', '');
                      }}
                      value={field.value}
                      disabled={loadingParent}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select category' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {parentCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
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
                    <FormLabel>
                      Sub-Category <span className='text-red-500'>*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!parentCategoryId || loadingSubcategories}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !parentCategoryId
                                ? 'Select category first'
                                : 'Select sub-category'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subcategories.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
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
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Provide detailed description of the resource...'
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Include specifications, features, or any important details
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
                      placeholder='Enter tags separated by commas (e.g., electronics, audio, portable)'
                      value={field.value?.join(', ') || ''}
                      onChange={(e) => {
                        const tags = e.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean);
                        field.onChange(tags);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Add tags to help categorize and search for this resource
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className='p-6 space-y-6'>
            <h3 className='text-lg font-semibold'>Location Details</h3>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Institution <span className='text-red-500'>*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={loadingInstitutions}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst: any) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
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
                name='department_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department (Optional)</FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value === 'none' ? undefined : value)
                      }
                      value={field.value || 'none'}
                      disabled={!selectedInstitutionId || loadingDepartments}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='none'>
                          No specific department
                        </SelectItem>
                        {departments.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.department_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Leave blank if resource is institution-wide
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='building_number'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Building Number</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., A Block' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='block_number'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Block Number</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., 2nd Block' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='floor_number'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor Number</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., 3rd Floor' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='room_number'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Number</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., 301' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='location_notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Notes</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Any additional location details...'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Provide specific directions or landmarks if needed
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='caretaker_user_ids'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caretaker / Responsible Person(s)</FormLabel>
                  <div className='rounded-lg border p-4'>
                    <div className='space-y-2 max-h-60 overflow-y-auto'>
                      {!selectedInstitutionId ? (
                        <p className='text-sm text-muted-foreground'>
                          Please select an institution first
                        </p>
                      ) : loadingStaff ? (
                        <p className='text-sm text-muted-foreground'>
                          Loading staff...
                        </p>
                      ) : staff.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>
                          No staff found for the selected institution
                          {selectedDepartmentId && '/department'}
                        </p>
                      ) : (
                        staff.map((s: any) => {
                          // Skip if id is missing
                          if (!s.id) return null;

                          return (
                            <div
                              key={s.id}
                              className='flex items-center space-x-2'
                            >
                              <Checkbox
                                id={`caretaker-${s.id}`}
                                checked={field.value?.includes(s.id) || false}
                                disabled={!selectedInstitutionId}
                                onCheckedChange={(checked) => {
                                  // Double-check institution is selected
                                  if (!selectedInstitutionId) {
                                    toast.error(
                                      'Please select an institution first'
                                    );
                                    return;
                                  }

                                  if (!s.id) {
                                    toast.error('Invalid staff member');
                                    return;
                                  }

                                  const currentValue = field.value || [];
                                  if (checked) {
                                    field.onChange([...currentValue, s.id]);
                                  } else {
                                    field.onChange(
                                      currentValue.filter(
                                        (id: string) => id !== s.id
                                      )
                                    );
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`caretaker-${s.id}`}
                                className='text-sm font-normal cursor-pointer'
                              >
                                {s.first_name} {s.last_name}
                                {s.designation && ` - ${s.designation}`}
                                {s.department?.department_name &&
                                  ` (${s.department.department_name})`}
                              </Label>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <FormDescription>
                    {!selectedInstitutionId
                      ? 'Select an institution to view available staff'
                      : selectedDepartmentId
                      ? 'Showing staff from selected department. Select one or more responsible persons.'
                      : 'Showing all staff from selected institution. Select one or more responsible persons.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock & Vendor Information</CardTitle>
            <CardDescription>
              Inventory details and supplier/vendor information.
            </CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='initial_stock_quantity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Initial Stock Quantity{' '}
                      <span className='text-red-500'>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='0'
                        placeholder='1'
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Total quantity when first acquired
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Name</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., ABC Supplies Inc.' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Email</FormLabel>
                    <FormControl>
                      <Input
                        type='email'
                        placeholder='e.g., vendor@example.com'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_mobile'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Mobile</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., +91 98765 43210' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_address_line1'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor Address Line 1</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Street address, P.O. box'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_address_line2'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2 (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Apartment, suite, unit, building, floor'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_city'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder='City name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_state'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State / Province</FormLabel>
                    <FormControl>
                      <Input placeholder='State or province' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='vendor_zip'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP / Postal Code</FormLabel>
                    <FormControl>
                      <Input placeholder='ZIP or postal code' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='vendor_support_contact'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Support Contact (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Support phone or email for maintenance issues'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Contact info for technical support or maintenance
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='vendor_contract_details'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Details (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Contract terms, warranty information, service agreements...'
                      className='min-h-[80px]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Any contract terms, SLAs, or warranty details
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifecycle Management</CardTitle>
            <CardDescription>
              Purchase details, warranty, maintenance, and depreciation
              tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='purchase_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase Date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='warranty_expiry_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warranty Expiry Date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='depreciation_rate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Depreciation Rate (% per year)</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='0'
                        max='100'
                        step='0.01'
                        placeholder='e.g., 10.5'
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Annual depreciation percentage (0-100%)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='current_value'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Value</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='0'
                        step='0.01'
                        placeholder='e.g., 15000'
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Current estimated value after depreciation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='maintenance_schedule'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maintenance Schedule</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g., Monthly, Quarterly, Annually'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>How often to maintain</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='disposal_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Planned Disposal Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormDescription>
                      Future date when resource will be retired/disposed
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='p-6 space-y-6'>
            <h3 className='text-lg font-semibold'>Booking Configuration</h3>
            <FormField
              control={form.control}
              name='booking_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Booking Type <span className='text-red-500'>*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select booking type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='reservation'>
                        Reservation Only
                      </SelectItem>
                      <SelectItem value='walk_in'>Walk-in Only</SelectItem>
                      <SelectItem value='both'>
                        Both Reservation & Walk-in
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How users can access this resource
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(bookingType === 'reservation' || bookingType === 'both') && (
              <div className='space-y-4 rounded-lg border p-4'>
                <h4 className='font-medium text-sm'>Reservation Settings</h4>
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>Maximum Advance Booking (days)</Label>
                    <Input
                      type='number'
                      min='1'
                      placeholder='30'
                      value={bookingConfig.max_advance_days || ''}
                      onChange={(e) =>
                        updateBookingConfig(
                          'max_advance_days',
                          parseInt(e.target.value)
                        )
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>Minimum Advance Notice (hours)</Label>
                    <Input
                      type='number'
                      min='0'
                      placeholder='2'
                      value={bookingConfig.min_advance_hours || ''}
                      onChange={(e) =>
                        updateBookingConfig(
                          'min_advance_hours',
                          parseInt(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>
                <div className='space-y-3'>
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='allow_overlap'
                      checked={bookingConfig.allow_overlap || false}
                      onCheckedChange={(checked) =>
                        updateBookingConfig('allow_overlap', checked)
                      }
                    />
                    <Label htmlFor='allow_overlap' className='font-normal'>
                      Allow overlapping reservations
                    </Label>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='require_approval'
                      checked={bookingConfig.require_approval || false}
                      onCheckedChange={(checked) =>
                        updateBookingConfig('require_approval', checked)
                      }
                    />
                    <Label htmlFor='require_approval' className='font-normal'>
                      Require approval for reservations
                    </Label>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval Workflow Setup</CardTitle>
            <CardDescription>
              Configure multi-level approval workflow with role-based approvers
              and escalation rules.
            </CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-6'>
            <div className='flex items-center space-x-2'>
              <Checkbox
                id='enable_approval'
                checked={approvalConfig.enabled || false}
                onCheckedChange={(checked) => {
                  updateApprovalConfig('enabled', checked);
                  if (!checked) {
                    // Clear approvers when disabled
                    updateApprovalConfig('approvers', []);
                  }
                }}
              />
              <Label htmlFor='enable_approval' className='font-normal'>
                Enable approval workflow for this resource
              </Label>
            </div>

            {approvalConfig.enabled && (
              <div className='space-y-6'>
                {/* Approval Type Selection */}
                <div className='space-y-3 rounded-lg border p-4 bg-muted/20'>
                  <Label>Approval Type</Label>
                  <Select
                    value={approvalConfig.approval_type || 'sequential'}
                    onValueChange={(value) =>
                      updateApprovalConfig('approval_type', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select approval type' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='sequential'>
                        Sequential (One after another)
                      </SelectItem>
                      <SelectItem value='parallel'>
                        Parallel (All at once)
                      </SelectItem>
                      <SelectItem value='conditional'>
                        Conditional (Based on criteria)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    {approvalConfig.approval_type === 'parallel'
                      ? 'All approvers will receive the request simultaneously'
                      : approvalConfig.approval_type === 'conditional'
                      ? 'Approval route determined by booking conditions'
                      : 'Approvers will receive requests in order of their level'}
                  </p>
                </div>

                {/* Add Approvers Section */}
                <div className='space-y-4 rounded-lg border p-4'>
                  <div className='flex items-center justify-between'>
                    <h4 className='font-medium text-sm'>Approvers List</h4>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        const newApprover = {
                          id: `approver-${Date.now()}`,
                          level: (approvalConfig.approvers?.length || 0) + 1,
                          is_required: true,
                          can_delegate: false
                        };
                        updateApprovalConfig('approvers', [
                          ...(approvalConfig.approvers || []),
                          newApprover
                        ]);
                      }}
                    >
                      Add Approver
                    </Button>
                  </div>

                  {(!approvalConfig.approvers ||
                    approvalConfig.approvers.length === 0) && (
                    <p className='text-sm text-muted-foreground text-center py-4'>
                      No approvers added. Click &quot;Add Approver&quot; to
                      configure approval workflow.
                    </p>
                  )}

                  <div className='space-y-3'>
                    {approvalConfig.approvers?.map((approver, index) => (
                      <div
                        key={approver.id}
                        className='rounded-lg border p-4 space-y-3 bg-background'
                      >
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2'>
                            <Badge variant='outline'>
                              Level {approver.level}
                            </Badge>
                            {approvalConfig.approval_type === 'sequential' && (
                              <span className='text-xs text-muted-foreground'>
                                {index === 0
                                  ? 'First'
                                  : `After Level ${approver.level - 1}`}
                              </span>
                            )}
                          </div>
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            onClick={() => {
                              const updated = approvalConfig.approvers?.filter(
                                (a) => a.id !== approver.id
                              );
                              // Reorder levels
                              updated?.forEach((a, i) => {
                                a.level = i + 1;
                              });
                              updateApprovalConfig('approvers', updated || []);
                            }}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>

                        <div className='grid gap-4 md:grid-cols-2'>
                          {/* Role or User Selection */}
                          <div className='space-y-2'>
                            <Label>Select by Role</Label>
                            <Select
                              value={approver.role_key || 'none'}
                              onValueChange={(value) => {
                                const updated = approvalConfig.approvers?.map(
                                  (a) =>
                                    a.id === approver.id
                                      ? {
                                          ...a,
                                          role_key:
                                            value === 'none'
                                              ? undefined
                                              : value,
                                          user_id: undefined // Clear user if role selected
                                        }
                                      : a
                                );
                                updateApprovalConfig(
                                  'approvers',
                                  updated || []
                                );
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder='Select role' />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='none'>
                                  None (Select User Instead)
                                </SelectItem>
                                {customRoles.map((role: any) => (
                                  <SelectItem
                                    key={role.id}
                                    value={role.role_key}
                                  >
                                    {role.role_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className='space-y-2'>
                            <Label>Or Select Specific User</Label>
                            <Select
                              value={approver.user_id || 'none'}
                              disabled={!!approver.role_key}
                              onValueChange={(value) => {
                                const updated = approvalConfig.approvers?.map(
                                  (a) =>
                                    a.id === approver.id
                                      ? {
                                          ...a,
                                          user_id:
                                            value === 'none' ? undefined : value
                                        }
                                      : a
                                );
                                updateApprovalConfig(
                                  'approvers',
                                  updated || []
                                );
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder='Select user' />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='none'>
                                  None (Use Role)
                                </SelectItem>
                                {staff.map((s: any) => {
                                  if (!s.id) return null;
                                  return (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.first_name} {s.last_name}
                                      {s.designation && ` - ${s.designation}`}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className='flex items-center gap-4'>
                          <div className='flex items-center space-x-2'>
                            <Checkbox
                              id={`required-${approver.id}`}
                              checked={approver.is_required}
                              onCheckedChange={(checked) => {
                                const updated = approvalConfig.approvers?.map(
                                  (a) =>
                                    a.id === approver.id
                                      ? { ...a, is_required: !!checked }
                                      : a
                                );
                                updateApprovalConfig(
                                  'approvers',
                                  updated || []
                                );
                              }}
                            />
                            <Label
                              htmlFor={`required-${approver.id}`}
                              className='font-normal text-sm'
                            >
                              Required Approver
                            </Label>
                          </div>
                          <div className='flex items-center space-x-2'>
                            <Checkbox
                              id={`delegate-${approver.id}`}
                              checked={approver.can_delegate || false}
                              onCheckedChange={(checked) => {
                                const updated = approvalConfig.approvers?.map(
                                  (a) =>
                                    a.id === approver.id
                                      ? { ...a, can_delegate: !!checked }
                                      : a
                                );
                                updateApprovalConfig(
                                  'approvers',
                                  updated || []
                                );
                              }}
                            />
                            <Label
                              htmlFor={`delegate-${approver.id}`}
                              className='font-normal text-sm'
                            >
                              Can Delegate
                            </Label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Auto-approval & Escalation Settings */}
                <div className='space-y-4 rounded-lg border p-4'>
                  <h4 className='font-medium text-sm'>
                    Auto-approval & Escalation
                  </h4>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label>Auto-approve after (hours)</Label>
                      <Input
                        type='number'
                        min='0'
                        placeholder='24'
                        value={approvalConfig.auto_approve_hours || ''}
                        onChange={(e) =>
                          updateApprovalConfig(
                            'auto_approve_hours',
                            parseInt(e.target.value) || undefined
                          )
                        }
                      />
                      <p className='text-xs text-muted-foreground'>
                        Auto-approve if no action taken
                      </p>
                    </div>
                    <div className='space-y-2'>
                      <Label>Escalation after (hours)</Label>
                      <Input
                        type='number'
                        min='0'
                        placeholder='48'
                        value={approvalConfig.escalation_hours || ''}
                        onChange={(e) =>
                          updateApprovalConfig(
                            'escalation_hours',
                            parseInt(e.target.value) || undefined
                          )
                        }
                      />
                      <p className='text-xs text-muted-foreground'>
                        Escalate to next level if no response
                      </p>
                    </div>
                  </div>
                </div>

                {/* Additional Options */}
                <div className='space-y-3 rounded-lg border p-4'>
                  <h4 className='font-medium text-sm'>Additional Options</h4>
                  {approvalConfig.approval_type === 'parallel' && (
                    <div className='flex items-center space-x-2'>
                      <Checkbox
                        id='require_all'
                        checked={approvalConfig.require_all_approvers || false}
                        onCheckedChange={(checked) =>
                          updateApprovalConfig('require_all_approvers', checked)
                        }
                      />
                      <Label htmlFor='require_all' className='font-normal'>
                        Require ALL approvers (instead of ANY)
                      </Label>
                    </div>
                  )}
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='notify_requester'
                      checked={approvalConfig.notify_requester || false}
                      onCheckedChange={(checked) =>
                        updateApprovalConfig('notify_requester', checked)
                      }
                    />
                    <Label htmlFor='notify_requester' className='font-normal'>
                      Notify requester on status changes
                    </Label>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminder Configuration</CardTitle>
            <CardDescription>
              Set up automatic reminders for reservations and maintenance.
            </CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label>Reminder Frequency (hours before)</Label>
                <Input
                  type='number'
                  min='1'
                  placeholder='e.g., 24'
                  value={
                    typeof reminderConfig.reminder_frequency === 'number'
                      ? reminderConfig.reminder_frequency
                      : ''
                  }
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || undefined;
                    form.setValue('reminder_config', {
                      ...reminderConfig,
                      reminder_frequency: value
                    });
                  }}
                />
                <p className='text-xs text-muted-foreground'>
                  Send reminder this many hours before reservation starts
                </p>
              </div>

              <div className='space-y-2'>
                <Label>Escalation Timeline (hours)</Label>
                <Input
                  type='number'
                  min='1'
                  placeholder='e.g., 48'
                  value={
                    typeof reminderConfig.escalation_timeline === 'number'
                      ? reminderConfig.escalation_timeline
                      : ''
                  }
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || undefined;
                    form.setValue('reminder_config', {
                      ...reminderConfig,
                      escalation_timeline: value
                    });
                  }}
                />
                <p className='text-xs text-muted-foreground'>
                  Escalate to supervisor if no action after this many hours
                </p>
              </div>

              <div className='space-y-2'>
                <Label>Auto-Cancellation (hours)</Label>
                <Input
                  type='number'
                  min='1'
                  placeholder='e.g., 72'
                  value={
                    typeof reminderConfig.auto_cancellation_hours === 'number'
                      ? reminderConfig.auto_cancellation_hours
                      : ''
                  }
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || undefined;
                    form.setValue('reminder_config', {
                      ...reminderConfig,
                      auto_cancellation_hours: value
                    });
                  }}
                />
                <p className='text-xs text-muted-foreground'>
                  Auto-cancel reservation if no confirmation after this many
                  hours
                </p>
              </div>
            </div>

            <div className='space-y-2'>
              <Label>Reminder Recipients</Label>
              <div className='rounded-lg border p-4 bg-muted/20'>
                <div className='space-y-2'>
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='remind_requester'
                      checked={
                        reminderConfig.reminder_recipients?.includes(
                          'requester'
                        ) || false
                      }
                      onCheckedChange={(checked) => {
                        const recipients =
                          reminderConfig.reminder_recipients || [];
                        const newRecipients = checked
                          ? [
                              ...recipients.filter(
                                (r: string) => r !== 'requester'
                              ),
                              'requester'
                            ]
                          : recipients.filter((r: string) => r !== 'requester');
                        form.setValue('reminder_config', {
                          ...reminderConfig,
                          reminder_recipients: newRecipients
                        });
                      }}
                    />
                    <Label htmlFor='remind_requester' className='font-normal'>
                      Send reminder to requester
                    </Label>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='remind_caretaker'
                      checked={
                        reminderConfig.reminder_recipients?.includes(
                          'caretaker'
                        ) || false
                      }
                      onCheckedChange={(checked) => {
                        const recipients =
                          reminderConfig.reminder_recipients || [];
                        const newRecipients = checked
                          ? [
                              ...recipients.filter(
                                (r: string) => r !== 'caretaker'
                              ),
                              'caretaker'
                            ]
                          : recipients.filter((r: string) => r !== 'caretaker');
                        form.setValue('reminder_config', {
                          ...reminderConfig,
                          reminder_recipients: newRecipients
                        });
                      }}
                    />
                    <Label htmlFor='remind_caretaker' className='font-normal'>
                      Send reminder to caretaker/responsible person
                    </Label>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='remind_approver'
                      checked={
                        reminderConfig.reminder_recipients?.includes(
                          'approver'
                        ) || false
                      }
                      onCheckedChange={(checked) => {
                        const recipients =
                          reminderConfig.reminder_recipients || [];
                        const newRecipients = checked
                          ? [
                              ...recipients.filter(
                                (r: string) => r !== 'approver'
                              ),
                              'approver'
                            ]
                          : recipients.filter((r: string) => r !== 'approver');
                        form.setValue('reminder_config', {
                          ...reminderConfig,
                          reminder_recipients: newRecipients
                        });
                      }}
                    />
                    <Label htmlFor='remind_approver' className='font-normal'>
                      Send reminder to approvers
                    </Label>
                  </div>
                </div>
              </div>
              <p className='text-xs text-muted-foreground'>
                Select who should receive reservation reminders
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access Control</CardTitle>
            <CardDescription>
              Define which roles can access and use this resource.
            </CardDescription>
          </CardHeader>
          <CardContent className='p-6 space-y-6'>
            <FormField
              control={form.control}
              name='access_roles'
              render={() => (
                <FormItem>
                  <FormLabel>Allowed Roles</FormLabel>
                  <div className='rounded-lg border p-4'>
                    {loadingRoles ? (
                      <p className='text-sm text-muted-foreground'>
                        Loading roles...
                      </p>
                    ) : customRoles.length === 0 ? (
                      <p className='text-sm text-muted-foreground'>
                        No roles found. Create roles in the organization
                        settings.
                      </p>
                    ) : (
                      <div className='space-y-3 max-h-60 overflow-y-auto'>
                        {customRoles.map((role: any) => (
                          <div
                            key={role.id}
                            className='flex items-start space-x-3'
                          >
                            <Checkbox
                              id={`role-${role.id}`}
                              checked={selectedAccessRoles.includes(
                                role.role_key
                              )}
                              onCheckedChange={(checked) => {
                                const currentRoles = selectedAccessRoles || [];
                                if (checked) {
                                  form.setValue('access_roles', [
                                    ...currentRoles,
                                    role.role_key
                                  ]);
                                } else {
                                  form.setValue(
                                    'access_roles',
                                    currentRoles.filter(
                                      (r: string) => r !== role.role_key
                                    )
                                  );
                                }
                              }}
                            />
                            <div className='grid gap-1.5 leading-none'>
                              <Label
                                htmlFor={`role-${role.id}`}
                                className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                              >
                                {role.role_name}
                                {role.is_system_role && (
                                  <span className='ml-2 text-xs text-muted-foreground'>
                                    (System Role)
                                  </span>
                                )}
                              </Label>
                              {role.description && (
                                <p className='text-sm text-muted-foreground'>
                                  {role.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    Select the roles that can view, book, and manage this
                    resource. If no roles are selected, all users will have
                    access.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {subcategoryId && attributeDefinitions.length > 0 && (
          <Card>
            <CardContent className='p-6 space-y-6'>
              <h3 className='text-lg font-semibold'>Custom Attributes</h3>
              {loadingAttributes ? (
                <div className='flex items-center justify-center py-8'>
                  <Loader2 className='h-6 w-6 animate-spin' />
                </div>
              ) : (
                <div className='space-y-4'>
                  {attributeDefinitions.map((attr) => (
                    <div key={attr.id} className='space-y-2'>
                      <Label>
                        {attr.attribute_key
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        {attr.is_required && (
                          <span className='text-red-500 ml-1'>*</span>
                        )}
                      </Label>
                      {attr.description && (
                        <p className='text-xs text-muted-foreground'>
                          {attr.description}
                        </p>
                      )}
                      {renderAttributeInput(attr)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className='p-6 space-y-6'>
            <h3 className='text-lg font-semibold'>Resource Images</h3>
            <div className='flex items-center justify-center w-full'>
              <label
                htmlFor='image-upload'
                className='flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/70 transition-colors'
              >
                <div className='flex flex-col items-center justify-center pt-5 pb-6'>
                  <Upload className='w-8 h-8 mb-3 text-muted-foreground' />
                  <p className='mb-2 text-sm text-muted-foreground'>
                    <span className='font-semibold'>Click to upload</span> or
                    drag and drop
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    JPG, PNG or WEBP (Max 5MB)
                  </p>
                </div>
                <Input
                  id='image-upload'
                  type='file'
                  className='hidden'
                  accept='image/jpeg,image/png,image/webp'
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                  disabled={uploading}
                />
              </label>
            </div>

            {getAllImages().length > 0 && (
              <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                {getAllImages().map((url: string, index: number) => (
                  <div key={index} className='relative group'>
                    <div className='aspect-square rounded-lg border overflow-hidden bg-gray-100'>
                      <Image
                        src={url}
                        alt={`Resource image ${index + 1}`}
                        className='h-full w-full object-cover'
                        width={100}
                        height={100}
                      />
                    </div>
                    <div className='absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2'>
                      {index < (resource?.image_urls || []).length ? (
                        <Button
                          type='button'
                          variant='secondary'
                          size='sm'
                          onClick={() => window.open(url, '_blank')}
                        >
                          <Eye className='h-4 w-4' />
                        </Button>
                      ) : (
                        <span className='text-xs text-white bg-black/50 px-2 py-1 rounded'>
                          Pending
                        </span>
                      )}
                      <Button
                        type='button'
                        variant='destructive'
                        size='sm'
                        onClick={() => removeImage(index)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                    {index === 0 && (
                      <div className='absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded'>
                        Primary
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className='flex justify-end space-x-4'>
          <Button
            variant='outline'
            onClick={() => router.push('/resource-management/resources')}
            type='button'
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Saving...
              </>
            ) : mode === 'create' ? (
              'Create Resource'
            ) : (
              'Update Resource'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
