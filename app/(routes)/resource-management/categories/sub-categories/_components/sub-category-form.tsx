'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Upload,
  X,
  Loader2,
  ImageIcon,
  Plus,
  Trash2,
  GripVertical
} from 'lucide-react';
import { useSubCategoryOperations } from '@/hooks/resource-management/use-sub-categories';
import { useParentCategoriesSelect } from '@/hooks/resource-management/use-parent-categories';
import type {
  SubCategory,
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
  CreateAttributeDefinitionDto
} from '@/types/resource-management';
import { CATEGORY_STATUS, ATTRIBUTE_TYPE } from '@/types/resource-management';
import { cn } from '@/lib/utils';

// Generate a UUID for new categories
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Form validation schema
const subCategorySchema = z.object({
  parent_category_id: z.string().min(1, 'Parent category is required'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  inherit_parent_attributes: z.boolean(),
  display_order: z.number().min(0).optional()
});

type FormData = z.infer<typeof subCategorySchema>;

interface SubCategoryFormProps {
  category?: SubCategory;
  mode: 'create' | 'edit';
}

export function SubCategoryForm({ category, mode }: SubCategoryFormProps) {
  const router = useRouter();
  const {
    createCategory,
    updateCategory,
    loading: operationLoading,
    authLoading
  } = useSubCategoryOperations();
  const { categories: parentCategories, loading: loadingParents } =
    useParentCategoriesSelect();

  const [imagePreview, setImagePreview] = useState<string | null>(
    category?.image_url || null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [attributeDefinitions, setAttributeDefinitions] = useState<
    CreateAttributeDefinitionDto[]
  >(
    category?.attribute_definitions?.map((attr) => ({
      attribute_key: attr.attribute_key,
      attribute_type: attr.attribute_type,
      is_required: attr.is_required,
      is_multiple: attr.is_multiple,
      default_value: attr.default_value,
      options: attr.options,
      validation_rules: attr.validation_rules,
      display_order: attr.display_order,
      description: attr.description
    })) || []
  );

  // Generate a consistent UUID for new categories
  const [categoryUUID] = useState(() => category?.id || generateUUID());

  const form = useForm<FormData>({
    resolver: zodResolver(subCategorySchema),
    defaultValues: {
      parent_category_id: category?.parent_category_id || '',
      name: category?.name || '',
      description: category?.description || '',
      status:
        (category?.status === 'archived' ? 'inactive' : category?.status) ||
        'active',
      inherit_parent_attributes: category?.inherit_parent_attributes || false,
      display_order: category?.display_order || 0
    }
  });

  // Handle image selection from file input
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(URL.createObjectURL(file));
  };

  // Remove image
  const handleRemoveImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
  };

  // Get category initials for avatar fallback
  const getCategoryInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Add new attribute definition
  const addAttributeDefinition = () => {
    const newAttr: CreateAttributeDefinitionDto = {
      attribute_key: '',
      attribute_type: 'text',
      is_required: false,
      is_multiple: false,
      display_order: attributeDefinitions.length + 1
    };
    setAttributeDefinitions([...attributeDefinitions, newAttr]);
  };

  // Remove attribute definition
  const removeAttributeDefinition = (index: number) => {
    setAttributeDefinitions(attributeDefinitions.filter((_, i) => i !== index));
  };

  // Update attribute definition
  const updateAttributeDefinition = (
    index: number,
    field: keyof CreateAttributeDefinitionDto,
    value: any
  ) => {
    const updated = [...attributeDefinitions];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-generate attribute_key from description if provided
    if (field === 'description' && value && !updated[index].attribute_key) {
      updated[index].attribute_key = value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
    }

    setAttributeDefinitions(updated);
  };

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    try {
      let finalImageUrl: string | undefined = category?.image_url;

      // If a new file is staged, upload it first
      if (imageFile) {
        setImageUploading(true);
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('type', 'category-image');
        formData.append('entityId', categoryUUID);

        const response = await fetch('/api/upload/resource-management', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: 'Failed to upload image' }));
          throw new Error(errorData.message || 'Failed to upload image');
        }

        const { url } = await response.json();
        finalImageUrl = url;
        setImageUploading(false);
      } else if (imagePreview === null && category?.image_url) {
        // If there was an image and it was removed, clear the URL
        finalImageUrl = undefined;
      }

      // Validate attribute definitions
      const validAttributeDefinitions = attributeDefinitions.filter(
        (attr) => attr.attribute_key.trim() && attr.description?.trim()
      );

      const dtoData = {
        parent_category_id: data.parent_category_id,
        name: data.name.trim(),
        description: data.description?.trim(),
        status: data.status,
        inherit_parent_attributes: data.inherit_parent_attributes,
        display_order: data.display_order || undefined,
        image_url: finalImageUrl,
        attribute_definitions:
          validAttributeDefinitions.length > 0
            ? validAttributeDefinitions
            : undefined
      };

      if (mode === 'create') {
        await createCategory(dtoData);
        router.push('/resource-management/categories/sub-categories');
      } else if (category) {
        await updateCategory(category.id, dtoData);
        router.push('/resource-management/categories/sub-categories');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'An unknown error occurred.'
      );
      console.error('Form submission error:', error);
    } finally {
      setImageUploading(false);
    }
  };

  const handleCancel = () => {
    router.push('/resource-management/categories/sub-categories');
  };

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === 'create' ? 'Create New Subcategory' : 'Edit Subcategory'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              {/* Basic Information */}
              <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                <div className='space-y-4'>
                  <FormField
                    control={form.control}
                    name='parent_category_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parent Category *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={operationLoading || loadingParents}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select parent category' />
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
                        <FormDescription>
                          Choose the parent category this subcategory belongs to
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subcategory Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Enter subcategory name'
                            {...field}
                            disabled={operationLoading}
                          />
                        </FormControl>
                        <FormDescription>
                          A unique name for this resource subcategory
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='display_order'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            placeholder='Enter display order'
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value ? parseInt(value, 10) : 0);
                            }}
                            disabled={operationLoading}
                          />
                        </FormControl>
                        <FormDescription>
                          Order in which this subcategory appears in lists
                          (optional)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='inherit_parent_attributes'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                        <div className='space-y-0.5'>
                          <FormLabel className='text-base'>
                            Inherit Parent Attributes
                          </FormLabel>
                          <FormDescription>
                            Automatically inherit all custom attributes defined
                            in the parent category
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={operationLoading}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='status'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={operationLoading}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select status' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={CATEGORY_STATUS.ACTIVE}>
                              <div className='flex items-center space-x-2'>
                                <Badge variant='default'>Active</Badge>
                                <span>Active</span>
                              </div>
                            </SelectItem>
                            <SelectItem value={CATEGORY_STATUS.INACTIVE}>
                              <div className='flex items-center space-x-2'>
                                <Badge variant='secondary'>Inactive</Badge>
                                <span>Inactive</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Only active subcategories can be used for new
                          resources
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Image Upload Section */}
                <div className='space-y-4'>
                  <div>
                    <Label>Subcategory Image</Label>
                    <div className='mt-2 space-y-4'>
                      {/* Image Preview */}
                      <div className='flex justify-center'>
                        <Avatar className='h-24 w-24'>
                          <AvatarImage
                            src={imagePreview || ''}
                            alt='Subcategory'
                          />
                          <AvatarFallback className='bg-primary/10'>
                            {imagePreview ? (
                              <ImageIcon className='h-8 w-8' />
                            ) : form.watch('name') ? (
                              getCategoryInitials(form.watch('name') || '')
                            ) : (
                              'SUB'
                            )}
                          </AvatarFallback>
                        </Avatar>
                      </div>

                      {/* Upload Controls */}
                      <div className='flex flex-col items-center space-y-2'>
                        {!imagePreview ? (
                          <div className='flex flex-col items-center space-y-2'>
                            <Label
                              htmlFor='image-upload'
                              className={cn(
                                'cursor-pointer inline-flex items-center px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50',
                                (operationLoading || imageUploading) &&
                                  'opacity-50 cursor-not-allowed'
                              )}
                            >
                              {imageUploading ? (
                                <>
                                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className='mr-2 h-4 w-4' />
                                  Upload Image
                                </>
                              )}
                            </Label>
                            <input
                              id='image-upload'
                              type='file'
                              accept='image/*'
                              onChange={handleImageSelect}
                              disabled={operationLoading || imageUploading}
                              className='hidden'
                            />
                          </div>
                        ) : (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={handleRemoveImage}
                            disabled={operationLoading}
                          >
                            <X className='mr-2 h-4 w-4' />
                            Remove Image
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Enter subcategory description'
                        className='min-h-[100px]'
                        {...field}
                        disabled={operationLoading}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional description to help users understand this
                      subcategory
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Custom Attribute Definitions */}
              <Card>
                <CardHeader>
                  <div className='flex items-center justify-between'>
                    <div>
                      <CardTitle className='text-lg'>
                        Custom Attributes
                      </CardTitle>
                      <p className='text-sm text-muted-foreground'>
                        Define custom attributes that resources in this
                        subcategory should have
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={addAttributeDefinition}
                      disabled={operationLoading}
                    >
                      <Plus className='mr-2 h-4 w-4' />
                      Add Attribute
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {attributeDefinitions.length === 0 ? (
                    <div className='text-center py-8 text-muted-foreground'>
                      <p>No custom attributes defined yet.</p>
                      <p className='text-sm'>
                        Click &quot;Add Attribute&quot; to create your first
                        custom attribute.
                      </p>
                    </div>
                  ) : (
                    <div className='space-y-4'>
                      {attributeDefinitions.map((attr, index) => (
                        <Card key={index} className='p-4'>
                          <div className='flex items-start justify-between mb-4'>
                            <div className='flex items-center space-x-2'>
                              <GripVertical className='h-4 w-4 text-muted-foreground' />
                              <span className='text-sm font-medium'>
                                Attribute {index + 1}
                              </span>
                            </div>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              onClick={() => removeAttributeDefinition(index)}
                              disabled={operationLoading}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>

                          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <div>
                              <Label htmlFor={`attr-desc-${index}`}>
                                Attribute Name *
                              </Label>
                              <Input
                                id={`attr-desc-${index}`}
                                placeholder='e.g., Screen Size, RAM, Weight'
                                value={attr.description || ''}
                                onChange={(e) =>
                                  updateAttributeDefinition(
                                    index,
                                    'description',
                                    e.target.value
                                  )
                                }
                                disabled={operationLoading}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`attr-key-${index}`}>
                                Attribute Key
                              </Label>
                              <Input
                                id={`attr-key-${index}`}
                                placeholder='Auto-generated from name'
                                value={attr.attribute_key}
                                onChange={(e) =>
                                  updateAttributeDefinition(
                                    index,
                                    'attribute_key',
                                    e.target.value
                                  )
                                }
                                disabled={operationLoading}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`attr-type-${index}`}>
                                Data Type
                              </Label>
                              <Select
                                value={attr.attribute_type}
                                onValueChange={(value) =>
                                  updateAttributeDefinition(
                                    index,
                                    'attribute_type',
                                    value
                                  )
                                }
                                disabled={operationLoading}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={ATTRIBUTE_TYPE.TEXT}>
                                    Text
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.NUMBER}>
                                    Number
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.DATE}>
                                    Date
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.BOOLEAN}>
                                    Yes/No
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.DROPDOWN}>
                                    Dropdown
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.TEXTAREA}>
                                    Long Text
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.EMAIL}>
                                    Email
                                  </SelectItem>
                                  <SelectItem value={ATTRIBUTE_TYPE.URL}>
                                    URL
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor={`attr-default-${index}`}>
                                Default Value
                              </Label>
                              <Input
                                id={`attr-default-${index}`}
                                placeholder='Optional default value'
                                value={attr.default_value || ''}
                                onChange={(e) =>
                                  updateAttributeDefinition(
                                    index,
                                    'default_value',
                                    e.target.value
                                  )
                                }
                                disabled={operationLoading}
                              />
                            </div>
                          </div>

                          {attr.attribute_type === 'dropdown' && (
                            <div className='mt-4'>
                              <Label htmlFor={`attr-options-${index}`}>
                                Dropdown Options
                              </Label>
                              <Input
                                id={`attr-options-${index}`}
                                placeholder='Enter options separated by commas'
                                value={attr.options?.join(', ') || ''}
                                onChange={(e) =>
                                  updateAttributeDefinition(
                                    index,
                                    'options',
                                    e.target.value
                                      .split(',')
                                      .map((opt) => opt.trim())
                                      .filter(Boolean)
                                  )
                                }
                                disabled={operationLoading}
                              />
                            </div>
                          )}

                          <div className='flex items-center space-x-6 mt-4'>
                            <div className='flex items-center space-x-2'>
                              <Switch
                                id={`attr-required-${index}`}
                                checked={attr.is_required}
                                onCheckedChange={(checked) =>
                                  updateAttributeDefinition(
                                    index,
                                    'is_required',
                                    checked
                                  )
                                }
                                disabled={operationLoading}
                              />
                              <Label htmlFor={`attr-required-${index}`}>
                                Required
                              </Label>
                            </div>
                            <div className='flex items-center space-x-2'>
                              <Switch
                                id={`attr-multiple-${index}`}
                                checked={attr.is_multiple}
                                onCheckedChange={(checked) =>
                                  updateAttributeDefinition(
                                    index,
                                    'is_multiple',
                                    checked
                                  )
                                }
                                disabled={operationLoading}
                              />
                              <Label htmlFor={`attr-multiple-${index}`}>
                                Multiple Values
                              </Label>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Form Actions */}
              <div className='flex items-center justify-end space-x-4 pt-6 border-t'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={handleCancel}
                  disabled={operationLoading}
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={operationLoading || imageUploading || authLoading}
                >
                  {authLoading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Verifying authentication...
                    </>
                  ) : operationLoading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      {mode === 'create' ? 'Creating...' : 'Updating...'}
                    </>
                  ) : mode === 'create' ? (
                    'Create Subcategory'
                  ) : (
                    'Update Subcategory'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
