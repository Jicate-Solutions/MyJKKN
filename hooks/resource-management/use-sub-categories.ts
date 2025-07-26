// hooks/resource-management/use-sub-categories.ts

'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { SubCategoryService } from '@/lib/services/resource-management/sub-category-service';
import type {
  SubCategory,
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
  SubCategoryFilters,
  SubCategoryListResponse,
  AttributeDefinition,
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  BulkOperationResult
} from '@/types/resource-management';
import { useAuth } from '@/hooks/use-auth';

// Hook for managing sub categories list with filters and pagination
export function useSubCategories(initialFilters: SubCategoryFilters = {}) {
  const [categories, setCategories] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<SubCategoryFilters>(initialFilters);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await SubCategoryService.getSubCategories(filters);
      setCategories(response.data);
      setMetadata(response.metadata);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch sub categories';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback(
    (newFilters: Partial<SubCategoryFilters>) => {
      setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
    },
    []
  );

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCategories
  };
}

// Hook for managing a single sub category
export function useSubCategory(id?: string) {
  const [category, setCategory] = useState<SubCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategory = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const categoryData = await SubCategoryService.getSubCategory(id);
      setCategory(categoryData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch sub category';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchCategory();
    }
  }, [fetchCategory]);

  return {
    category,
    loading,
    error,
    fetchCategory
  };
}

// Hook for CRUD operations on sub categories
export function useSubCategoryOperations() {
  const { profile, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);

  const createCategory = useCallback(
    async (categoryData: CreateSubCategoryDto): Promise<SubCategory | null> => {
      if (authLoading) {
        toast.error('Please wait while we verify your authentication');
        return null;
      }

      if (!profile?.id) {
        toast.error('You must be logged in to create categories');
        return null;
      }

      try {
        setLoading(true);
        const newCategory = await SubCategoryService.createSubCategory(
          categoryData,
          profile.id
        );
        toast.success('Sub category created successfully');
        return newCategory;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create sub category';
        toast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile?.id, authLoading]
  );

  const updateCategory = useCallback(
    async (
      id: string,
      categoryData: UpdateSubCategoryDto
    ): Promise<SubCategory | null> => {
      if (authLoading) {
        toast.error('Please wait while we verify your authentication');
        return null;
      }

      if (!profile?.id) {
        toast.error('You must be logged in to update categories');
        return null;
      }

      try {
        setLoading(true);
        const updatedCategory = await SubCategoryService.updateSubCategory(
          id,
          categoryData,
          profile.id
        );
        toast.success('Sub category updated successfully');
        return updatedCategory;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update sub category';
        toast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile?.id, authLoading]
  );

  const deleteCategory = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await SubCategoryService.deleteSubCategory(id);
      if (success) {
        toast.success('Sub category deleted successfully');
      }
      return success;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete sub category';
      toast.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkDeleteCategories = useCallback(
    async (ids: string[]): Promise<BulkOperationResult> => {
      try {
        setLoading(true);
        const result = await SubCategoryService.bulkDeleteSubCategories(ids);

        if (result.success) {
        } else {
          toast.error(
            `Deleted ${result.processedCount} categories, but ${result.errors.length} failed`
          );
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete categories';
        toast.error(errorMessage);
        return {
          success: false,
          processedCount: 0,
          errors: [{ id: 'unknown', error: errorMessage }]
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    authLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    bulkDeleteCategories
  };
}

// Hook for getting sub categories by parent category
export function useSubCategoriesByParent(parentCategoryId?: string) {
  const [categories, setCategories] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!parentCategoryId) {
      setCategories([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const categoriesData = await SubCategoryService.getSubCategoriesByParent(
        parentCategoryId
      );
      setCategories(categoriesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch sub categories';
      setError(errorMessage);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [parentCategoryId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories
  };
}

// Hook for getting sub categories for select/dropdown components
export function useSubCategoriesSelect(parentCategoryId?: string) {
  const [categories, setCategories] = useState<
    Array<{
      id: string;
      name: string;
      parent_category_id: string;
      parent_category_name?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategoriesForSelect = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const categoriesData = await SubCategoryService.getSubCategoriesForSelect(
        parentCategoryId
      );
      setCategories(categoriesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch sub categories';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [parentCategoryId]);

  useEffect(() => {
    fetchCategoriesForSelect();
  }, [fetchCategoriesForSelect]);

  return {
    categories,
    loading,
    error,
    refetch: fetchCategoriesForSelect
  };
}

// ===== ATTRIBUTE DEFINITION HOOKS =====

// Hook for managing attribute definitions for a sub category
export function useAttributeDefinitions(subcategoryId?: string) {
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttributes = useCallback(async () => {
    if (!subcategoryId) {
      setAttributes([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const attributesData = await SubCategoryService.getAttributeDefinitions(
        subcategoryId
      );
      setAttributes(attributesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch attribute definitions';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [subcategoryId]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  return {
    attributes,
    loading,
    error,
    refetch: fetchAttributes
  };
}

// Hook for CRUD operations on attribute definitions
export function useAttributeDefinitionOperations() {
  const [loading, setLoading] = useState(false);

  const createAttributes = useCallback(
    async (
      subcategoryId: string,
      attributeDefinitions: CreateAttributeDefinitionDto[]
    ): Promise<AttributeDefinition[]> => {
      try {
        setLoading(true);
        const newAttributes =
          await SubCategoryService.createAttributeDefinitions(
            subcategoryId,
            attributeDefinitions
          );
        toast.success('Attribute definitions created successfully');
        return newAttributes;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to create attribute definitions';
        toast.error(errorMessage);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateAttribute = useCallback(
    async (
      id: string,
      attributeData: UpdateAttributeDefinitionDto
    ): Promise<AttributeDefinition | null> => {
      try {
        setLoading(true);
        const updatedAttribute =
          await SubCategoryService.updateAttributeDefinition(id, attributeData);
        toast.success('Attribute definition updated successfully');
        return updatedAttribute;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to update attribute definition';
        toast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteAttribute = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await SubCategoryService.deleteAttributeDefinition(id);
      if (success) {
        toast.success('Attribute definition deleted successfully');
      }
      return success;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to delete attribute definition';
      toast.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAttributeDisplayOrder = useCallback(
    async (
      attributeOrders: Array<{ id: string; display_order: number }>
    ): Promise<boolean> => {
      try {
        setLoading(true);
        const success = await SubCategoryService.updateAttributeDisplayOrder(
          attributeOrders
        );
        if (success) {
          toast.success('Attribute order updated successfully');
        }
        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to update attribute order';
        toast.error(errorMessage);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    createAttributes,
    updateAttribute,
    deleteAttribute,
    updateAttributeDisplayOrder
  };
}

// Hook for validating attribute values
export function useAttributeValidation() {
  const validateValue = useCallback(
    (definition: AttributeDefinition, value: any) => {
      return SubCategoryService.validateAttributeValue(definition, value);
    },
    []
  );

  const validateValues = useCallback(
    (definitions: AttributeDefinition[], values: Record<string, any>) => {
      return SubCategoryService.validateAttributeValues(definitions, values);
    },
    []
  );

  return {
    validateValue,
    validateValues
  };
}

// Hook for managing attribute form state
export function useAttributeForm(
  initialDefinitions: AttributeDefinition[] = []
) {
  const [definitions, setDefinitions] =
    useState<AttributeDefinition[]>(initialDefinitions);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { validateValues } = useAttributeValidation();

  // Initialize default values when definitions change
  useEffect(() => {
    const defaultValues: Record<string, any> = {};
    definitions.forEach((def) => {
      if (def.default_value !== undefined && def.default_value !== null) {
        defaultValues[def.attribute_key] = def.default_value;
      }
    });
    setValues((prev) => ({ ...defaultValues, ...prev }));
  }, [definitions]);

  const updateValue = useCallback(
    (key: string, value: any) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      // Clear error for this field when user updates value
      if (errors[key]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[key];
          return newErrors;
        });
      }
    },
    [errors]
  );

  const validateAll = useCallback(() => {
    const validation = validateValues(definitions, values);
    setErrors(validation.errors);
    return validation.isValid;
  }, [definitions, values, validateValues]);

  const resetForm = useCallback(() => {
    const defaultValues: Record<string, any> = {};
    definitions.forEach((def) => {
      if (def.default_value !== undefined && def.default_value !== null) {
        defaultValues[def.attribute_key] = def.default_value;
      }
    });
    setValues(defaultValues);
    setErrors({});
  }, [definitions]);

  const setFormValues = useCallback((newValues: Record<string, any>) => {
    setValues(newValues);
    setErrors({});
  }, []);

  return {
    definitions,
    setDefinitions,
    values,
    errors,
    updateValue,
    validateAll,
    resetForm,
    setFormValues
  };
}
