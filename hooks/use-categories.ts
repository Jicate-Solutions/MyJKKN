// hooks/use-categories.ts
import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { Category } from '@/types/categories';

const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from('categories')
    .select('*, subcategories(*)');

  if (error) throw error;

  return data.map((category) => ({
    ...category,
    description: category.description || undefined,
    subcategories: category.subcategories || []
  }));
};

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    'categories',
    fetchCategories,
    {
      revalidateOnFocus: true,
      refreshInterval: 30000 // Refresh every 30 seconds
    }
  );

  return {
    categories: data || [],
    isLoading,
    error,
    mutate
  };
}
