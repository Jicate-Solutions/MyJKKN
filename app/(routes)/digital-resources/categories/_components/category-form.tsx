'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useDigitalResourceCategories } from '@/hooks/resource/use-digital-resource-categories';
import { DigitalResourceCategory } from '@/types/digital-resources';
import { toast } from 'sonner';

const formSchema = z.object({
  category_name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  attributes: z.array(z.string()).optional(),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof formSchema>;

interface CategoryFormProps {
  initialData?: DigitalResourceCategory;
  category?: DigitalResourceCategory | null;
  onSuccess?: () => void;
  onSubmit?: (id: string, values: FormValues) => void;
  submitting?: boolean;
}

export function CategoryForm({ 
  initialData, 
  category,
  onSuccess, 
  onSubmit,
  submitting = false
}: CategoryFormProps) {
  const router = useRouter();
  const [attributeInput, setAttributeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { 
    categories, 
    loading, 
    createCategory, 
    updateCategory,
    fetchCategories 
  } = useDigitalResourceCategories();

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Use either initialData or category prop
  const categoryData = initialData || category || undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: categoryData ? {
      ...categoryData,
      attributes: categoryData.attributes || []
    } : {
      category_name: '',
      description: '',
      attributes: [],
      is_active: true
    }
  });

  const attributes = form.watch('attributes') || [];

  const addAttribute = () => {
    if (!attributeInput.trim()) return;
    
    const currentAttributes = form.getValues('attributes') || [];
    if (!currentAttributes.includes(attributeInput.trim())) {
      form.setValue('attributes', [...currentAttributes, attributeInput.trim()]);
    }
    setAttributeInput('');
  };

  const removeAttribute = (attribute: string) => {
    const currentAttributes = form.getValues('attributes') || [];
    form.setValue(
      'attributes',
      currentAttributes.filter(attr => attr !== attribute)
    );
  };

  const handleFormSubmit = async (values: FormValues) => {
    // If custom onSubmit is provided, use that (for dialogs)
    if (onSubmit && categoryData) {
      onSubmit(categoryData.id, values);
      return;
    }

    setIsSubmitting(true);
    try {
      if (categoryData) {
        await updateCategory(categoryData.id, values);
        toast.success('Category updated successfully');
      } else {
        await createCategory(values);
        toast.success('Category created successfully');
      }
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/digital-resources/categories');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="category_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category Name*</FormLabel>
              <FormControl>
                <Input placeholder="Enter category name" {...field} />
              </FormControl>
              <FormDescription>
                The name of the digital resource category
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter category description"
                  className="resize-none"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Detailed description of the category
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormLabel>Attributes</FormLabel>
          <div className="flex gap-2">
            <Input
              placeholder="Add attribute"
              value={attributeInput}
              onChange={(e) => setAttributeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAttribute();
                }
              }}
            />
            <Button type="button" onClick={addAttribute}>
              Add
            </Button>
          </div>
          <FormDescription>
            Add attributes relevant to this category
          </FormDescription>
          
          <div className="flex flex-wrap gap-2 mt-2">
            {attributes.map((attribute, index) => (
              <Badge key={index} variant="secondary" className="px-2 py-1">
                {attribute}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-2"
                  onClick={() => removeAttribute(attribute)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive categories won&apos;t be shown in category lists
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          {!onSubmit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/digital-resources/categories')}
              disabled={isSubmitting || submitting}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting || submitting}>
            {isSubmitting || submitting
              ? categoryData
                ? 'Updating...'
                : 'Creating...'
              : categoryData
                ? 'Update Category'
                : 'Create Category'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
