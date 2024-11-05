'use client';
// hooks/use-categories.ts
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Category, Subcategory } from '@/types/categories';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function fetchData() {
      try {
        const [categoriesResponse, subcategoriesResponse] = await Promise.all([
          supabase
            .from('application_categories')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true }),
          supabase
            .from('application_subcategories')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
        ]);

        if (categoriesResponse.error) throw categoriesResponse.error;
        if (subcategoriesResponse.error) throw subcategoriesResponse.error;

        setCategories(categoriesResponse.data);
        setSubcategories(subcategoriesResponse.data);
      } catch (err) {
        console.error('Error fetching categories:', err);
        setError('Failed to load categories');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [supabase]);

  const getSubcategoriesForCategory = (categoryId: string) => {
    return subcategories.filter((sub) => sub.category_id === categoryId);
  };

  return {
    categories,
    subcategories,
    getSubcategoriesForCategory,
    isLoading,
    error
  };
}
