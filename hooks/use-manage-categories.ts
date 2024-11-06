// hooks/use-manage-categories.ts
import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { CategoryService } from '@/lib/services/category-service';
import {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateSubcategoryInput
} from '@/types/categories';

export function useManageCategories() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCategory = useCallback(async (input: CreateCategoryInput) => {
    try {
      setIsLoading(true);
      setError(null);
      return await CategoryService.createCategory(input);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create category';
      setError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateCategory = useCallback(
    async (id: string, input: UpdateCategoryInput) => {
      try {
        setIsLoading(true);
        setError(null);
        return await CategoryService.updateCategory(id, input);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update category';
        setError(errorMessage);
        toast.error(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteCategory = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      return await CategoryService.deleteCategory(id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete category';
      setError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createSubcategory = useCallback(
    async (categoryId: string, input: CreateSubcategoryInput) => {
      try {
        setIsLoading(true);
        setError(null);
        return await CategoryService.createSubcategory(categoryId, input);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create subcategory';
        setError(errorMessage);
        toast.error(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteSubcategory = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      return await CategoryService.deleteSubcategory(id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete subcategory';
      setError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchCategories = useCallback(async (query: string) => {
    try {
      setIsLoading(true);
      setError(null);
      return await CategoryService.searchCategories(query);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to search categories';
      setError(errorMessage);
      toast.error(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubcategory,
    deleteSubcategory,
    searchCategories
  };
}
