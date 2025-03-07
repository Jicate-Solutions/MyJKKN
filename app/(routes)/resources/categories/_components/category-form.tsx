'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useResourceCategories } from '@/hooks/resource/use-resource-categories';
import { CreateResourceCategoryDto, ResourceCategory } from '@/types/resources';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { ResourceCategoryService } from '@/lib/services/resource/resource-category-service';
import { toast } from 'react-hot-toast';
import { X, Plus } from 'lucide-react';

// Define the form schema
const formSchema = z.object({
  category_name: z.string().min(2, {
    message: 'Category name must be at least 2 characters.'
  }),
  parent_category_id: z.string().optional(),
  description: z.string().optional(),
  attributes: z.array(z.string()).optional(),
  is_active: z.boolean().default(true)
});

interface CategoryFormProps {
  initialData?: ResourceCategory;
  isEditing?: boolean;
}

export function CategoryForm({
  initialData,
  isEditing = false
}: CategoryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [parentCategories, setParentCategories] = useState<ResourceCategory[]>(
    []
  );
  const [newAttribute, setNewAttribute] = useState('');
  const { fetchCategories } = useResourceCategories();

  // Initialize the form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category_name: initialData?.category_name || '',
      parent_category_id: initialData?.parent_category_id || undefined,
      description: initialData?.description || '',
      attributes: initialData?.attributes || [],
      is_active: initialData?.is_active ?? true
    }
  });

  // Load parent categories
  useEffect(() => {
    const loadParentCategories = async () => {
      try {
        const result = await ResourceCategoryService.getAllResourceCategories();
        // Filter out the current category if editing to prevent circular references
        const filteredCategories = isEditing
          ? result.filter((cat) => cat.id !== initialData?.id)
          : result;
        setParentCategories(filteredCategories);
      } catch (error) {
        console.error('Error loading parent categories:', error);
        toast.error('Failed to load parent categories');
      }
    };

    loadParentCategories();
  }, [initialData?.id, isEditing]);

  // Handle form submission
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      const categoryData: CreateResourceCategoryDto = {
        category_name: values.category_name,
        parent_category_id: values.parent_category_id || undefined,
        description: values.description || undefined,
        attributes: values.attributes || undefined,
        is_active: values.is_active
      };

      if (isEditing && initialData) {
        await ResourceCategoryService.updateResourceCategory(
          initialData.id,
          categoryData
        );
        toast.success('Category updated successfully');
      } else {
        await ResourceCategoryService.createResourceCategory(categoryData);
        toast.success('Category created successfully');
      }

      // Refresh the categories list
      fetchCategories();

      // Navigate back to categories list
      router.push('/resources/categories');
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error(
        isEditing ? 'Failed to update category' : 'Failed to create category'
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle adding a new attribute
  const handleAddAttribute = () => {
    if (!newAttribute.trim()) return;

    const currentAttributes = form.getValues('attributes') || [];
    form.setValue('attributes', [...currentAttributes, newAttribute.trim()]);
    setNewAttribute('');
  };

  // Handle removing an attribute
  const handleRemoveAttribute = (index: number) => {
    const currentAttributes = form.getValues('attributes') || [];
    form.setValue(
      'attributes',
      currentAttributes.filter((_, i) => i !== index)
    );
  };

  // Handle key press in attribute input
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAttribute();
    }
  };

  return (
    <Card>
      <CardContent className='pt-6'>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <FormField
              control={form.control}
              name='category_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder='Enter category name' {...field} />
                  </FormControl>
                  <FormDescription>
                    The name of the resource category.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='parent_category_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      // Convert 'none' back to undefined/empty string for the form
                      field.onChange(value === 'none' ? undefined : value);
                    }}
                    value={field.value || 'none'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select a parent category (optional)' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='none'>
                        None (Top Level Category)
                      </SelectItem>
                      {parentCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.category_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Optional parent category for hierarchical organization.
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
                      placeholder='Enter category description'
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    A brief description of the category.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='space-y-2'>
              <FormLabel>Attributes</FormLabel>
              <div className='flex space-x-2'>
                <Input
                  placeholder='Add an attribute (e.g., RAM, Processor, Size)'
                  value={newAttribute}
                  onChange={(e) => setNewAttribute(e.target.value)}
                  onKeyDown={handleKeyPress}
                />
                <Button
                  type='button'
                  onClick={handleAddAttribute}
                  variant='outline'
                >
                  <Plus className='h-4 w-4 mr-2' />
                  Add
                </Button>
              </div>
              <FormDescription>
                Define attributes that resources in this category might have.
              </FormDescription>

              <div className='flex flex-wrap gap-2 mt-2'>
                {form.watch('attributes')?.map((attr, index) => (
                  <div
                    key={index}
                    className='flex items-center bg-muted px-3 py-1 rounded-md'
                  >
                    <span>{attr}</span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-6 w-6 p-0 ml-2'
                      onClick={() => handleRemoveAttribute(index)}
                    >
                      <X className='h-3 w-3' />
                      <span className='sr-only'>Remove</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Active Status</FormLabel>
                    <FormDescription>
                      Set whether this category is active and available for use.
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

            <div className='flex justify-end space-x-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.push('/resources/categories')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={loading}>
                {loading
                  ? 'Saving...'
                  : isEditing
                  ? 'Update Category'
                  : 'Create Category'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
