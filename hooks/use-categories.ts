// hooks/use-categories.ts
import useSWR from 'swr';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Category } from '@/types/categories';

const supabase = createClientComponentClient();

async function fetchCategories(): Promise<Category[]> {
  const { data: categories, error } = await supabase
    .from('categories')
    .select('*, subcategories(*)');

  if (error) throw error;

  return categories.map((category) => ({
    ...category,
    subcategories: category.subcategories || []
  }));
}

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    'categories',
    fetchCategories
  );

  return {
    categories: data || [],
    isLoading,
    error,
    mutate
  };
}
