// hooks/resource/use-digital-resource-categories.ts

import { useState, useCallback } from 'react';
import type {
  DigitalResourceCategory,
  DigitalResourceCategoryFilters,
  CreateDigitalResourceCategoryDto,
  UpdateDigitalResourceCategoryDto
} from '@/types/digital-resources';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export function useDigitalResourceCategories(initialFilters: DigitalResourceCategoryFilters = {}) {
  const [categories, setCategories] = useState<DigitalResourceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DigitalResourceCategoryFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const supabase = createClientSupabaseClient();

  const fetchCategories = useCallback(
    async (newFilters?: DigitalResourceCategoryFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const {
          search,
          isActive,
          page = 1,
          limit = 10
        } = currentFilters;

        // Calculate pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Start building the query
        let query = supabase
          .from('digital_resource_categories')
          .select('*', {
            count: 'exact'
          });

        // Apply filters
        if (search) {
          query = query.ilike('category_name', `%${search}%`);
        }

        if (isActive !== undefined) {
          query = query.eq('is_active', isActive);
        }

        // Apply pagination
        query = query.range(from, to);

        // Execute the query
        const { data, error, count } = await query;

        if (error) throw error;

        // Calculate total pages
        const totalPages = count ? Math.ceil(count / limit) : 0;

        setCategories(data as DigitalResourceCategory[]);
        setMetadata({
          total: count || 0,
          page,
          limit,
          totalPages
        });

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching digital resource categories:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters, supabase]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<DigitalResourceCategoryFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchCategories(updatedFilters);
    },
    [filters, fetchCategories]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchCategories(updatedFilters);
    },
    [filters, fetchCategories]
  );

  const createCategory = useCallback(
    async (data: CreateDigitalResourceCategoryDto) => {
      try {
        setLoading(true);
        setError(null);

        const { data: category, error } = await supabase
          .from('digital_resource_categories')
          .insert({
            category_name: data.category_name,
            description: data.description,
            attributes: data.attributes,
            is_active: data.is_active ?? true
          })
          .select('*')
          .single();

        if (error) throw error;

        // Refresh the list
        fetchCategories();
        toast.success('Digital resource category created successfully');
        return category as DigitalResourceCategory;
      } catch (err) {
        console.error('Error creating digital resource category:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to create digital resource category');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchCategories, supabase]
  );

  const updateCategory = useCallback(
    async (id: string, data: UpdateDigitalResourceCategoryDto) => {
      try {
        setLoading(true);
        setError(null);

        const { data: category, error } = await supabase
          .from('digital_resource_categories')
          .update({
            category_name: data.category_name,
            description: data.description,
            attributes: data.attributes,
            is_active: data.is_active
          })
          .eq('id', id)
          .select('*')
          .single();

        if (error) throw error;

        // Refresh the list
        fetchCategories();
        toast.success('Digital resource category updated successfully');
        return category as DigitalResourceCategory;
      } catch (err) {
        console.error('Error updating digital resource category:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to update digital resource category');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchCategories, supabase]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);

        // First check if there are any resources using this category
        const { data: resources, error: resourcesError } = await supabase
          .from('digital_resources')
          .select('id')
          .eq('category_id', id)
          .limit(1);

        if (resourcesError) throw resourcesError;

        if (resources && resources.length > 0) {
          toast.error('Cannot delete category: it is being used by digital resources');
          return false;
        }

        // If no resources, proceed with deletion
        const { error } = await supabase
          .from('digital_resource_categories')
          .delete()
          .eq('id', id);

        if (error) throw error;

        // Refresh the list
        fetchCategories();
        toast.success('Digital resource category deleted successfully');
        return true;
      } catch (err) {
        console.error('Error deleting digital resource category:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to delete digital resource category');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchCategories, supabase]
  );

  return {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory
  };
}
