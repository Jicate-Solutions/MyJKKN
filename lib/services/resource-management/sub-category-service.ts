// lib/services/resource-management/sub-category-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
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

export class SubCategoryService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all sub categories with filtering and pagination
   */
  static async getSubCategories(
    filters: SubCategoryFilters = {}
  ): Promise<SubCategoryListResponse> {
    try {
      let query = (this.supabase as any).from('resource_sub_categories').select(
        `
          *,
          parent_category:resource_parent_categories(
            id,
            name,
            status
          ),
          resources:resources(count)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      if (filters.parent_category_id) {
        query = query.eq('parent_category_id', filters.parent_category_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortOrder = filters.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data: categories, error, count } = await query;

      if (error) throw error;

      // Transform data to include resource count
      const transformedCategories = (categories || []).map((category) => ({
        ...category,
        resources_count: category.resources?.[0]?.count || 0
      }));

      return {
        data: transformedCategories,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching sub categories:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch sub categories'
      );
    }
  }

  /**
   * Get a single sub category by ID
   */
  static async getSubCategory(id: string): Promise<SubCategory> {
    try {
      // Fetch basic category data with parent category
      const { data: category, error } = await this.supabase
        .from('resource_sub_categories')
        .select(
          `
          *,
          parent_category:resource_parent_categories(*)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!category) throw new Error('Sub category not found');

      // Fetch created by user separately
      const categoryData = category as any;
      let createdByUser = null;
      if (categoryData.created_by) {
        const { data: createdUser } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', categoryData.created_by)
          .maybeSingle();
        createdByUser = createdUser;
      }

      // Fetch updated by user separately
      let updatedByUser = null;
      if (categoryData.updated_by) {
        const { data: updatedUser } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', categoryData.updated_by)
          .maybeSingle();
        updatedByUser = updatedUser;
      }

      // Return category with user data
      return {
        ...categoryData,
        created_by_user: createdByUser,
        updated_by_user: updatedByUser
      } as SubCategory;
    } catch (error) {
      console.error('Error fetching sub category:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch sub category'
      );
    }
  }

  /**
   * Create a new sub category
   */
  static async createSubCategory(
    categoryData: CreateSubCategoryDto,
    userId: string
  ): Promise<SubCategory> {
    try {
      // Check if category name already exists within the same parent
      const { data: existingCategory } = await this.supabase
        .from('resource_sub_categories')
        .select('id')
        .eq('name', categoryData.name.trim())
        .eq('parent_category_id', categoryData.parent_category_id)
        .maybeSingle();

      if (existingCategory) {
        throw new Error(
          'A subcategory with this name already exists in this parent category'
        );
      }

      // Get the next display order if not provided
      let displayOrder = categoryData.display_order;
      if (displayOrder === undefined) {
        const { data: lastCategory } = await this.supabase
          .from('resource_sub_categories')
          .select('display_order')
          .eq('parent_category_id', categoryData.parent_category_id)
          .order('display_order', { ascending: false })
          .limit(1)
          .maybeSingle();

        displayOrder = ((lastCategory as any)?.display_order || 0) + 1;
      }

      // Start a transaction
      const query: any = this.supabase
        .from('resource_sub_categories');

      const { data: category, error } = await query
        .insert({
          name: categoryData.name.trim(),
          description: categoryData.description,
          image_url: categoryData.image_url,
          parent_category_id: categoryData.parent_category_id,
          status: categoryData.status,
          // inherit_parent_attributes removed - obsolete field
          display_order: displayOrder,
          created_by: userId,
          updated_by: userId
        })
        .select()
        .single();

      if (error) throw error;

      // DEPRECATED: attribute_definitions removed - custom attributes now managed per-resource
      // Legacy code removed - no longer creating attribute definitions at subcategory level

      return category;
    } catch (error) {
      console.error('Error creating sub category:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create sub category'
      );
    }
  }

  /**
   * Update an existing sub category
   */
  static async updateSubCategory(
    id: string,
    categoryData: UpdateSubCategoryDto,
    userId: string
  ): Promise<SubCategory> {
    try {
      // Check if category exists
      const existingCategory = await this.getSubCategory(id);
      if (!existingCategory) {
        throw new Error('Sub category not found');
      }

      // Check if new name conflicts with existing categories (excluding current)
      if (categoryData.name && categoryData.parent_category_id) {
        const { data: conflictCategory } = await this.supabase
          .from('resource_sub_categories')
          .select('id')
          .eq('name', categoryData.name.trim())
          .eq('parent_category_id', categoryData.parent_category_id)
          .neq('id', id)
          .maybeSingle();

        if (conflictCategory) {
          throw new Error(
            'A subcategory with this name already exists in this parent category'
          );
        }
      }

      const updateData = {
        ...categoryData,
        ...(categoryData.name && { name: categoryData.name.trim() }),
        updated_by: userId,
        updated_at: new Date().toISOString()
      };

      const query: any = this.supabase
        .from('resource_sub_categories');

      const { data: category, error } = await query
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // DEPRECATED: attribute_definitions handling removed
      // Custom attributes are now managed at the resource level in resources.custom_attributes

      // Return the updated category with fresh data
      return await this.getSubCategory(id);
    } catch (error) {
      console.error('Error updating sub category:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update sub category'
      );
    }
  }

  /**
   * Delete a sub category (permanent delete)
   */
  static async deleteSubCategory(id: string): Promise<boolean> {
    try {
      // First get the subcategory to check for resources and get image info
      const { data: category, error: fetchError } = await this.supabase
        .from('resource_sub_categories')
        .select('id, name, image_url')
        .eq('id', id)
        .single();

      if (fetchError) {
        throw new Error('Subcategory not found');
      }

      const categoryData = category as any;

      // Check if category has any resources
      const { data: resources } = await this.supabase
        .from('resources')
        .select('id')
        .eq('subcategory_id', id)
        .limit(1);

      if (resources && resources.length > 0) {
        throw new Error(
          `Cannot delete subcategory "${categoryData.name}" because it has ${resources.length} resource(s). Please delete or move them first.`
        );
      }

      // Delete attribute definitions first (they reference this subcategory)
      const { error: attrError } = await this.supabase
        .from('resource_attribute_definitions')
        .delete()
        .eq('subcategory_id', id);

      if (attrError) {
        console.error('Error deleting attribute definitions:', attrError);
        throw new Error('Failed to delete associated attribute definitions');
      }

      // Perform permanent delete
      const { error } = await this.supabase
        .from('resource_sub_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log(`Successfully deleted subcategory ${id} from database`);

      // Delete the category image from storage if it exists
      // Note: Subcategory images would be stored in the same bucket as parent categories
      if (categoryData.image_url) {
        try {
          const { StorageService } = await import(
            '@/lib/storage/storage-service'
          );
          const { error: deleteError } =
            await StorageService.deleteCategoryImageByUrl(categoryData.image_url);
          if (deleteError) {
            console.error(
              `Storage deletion error for subcategory ${id}:`,
              deleteError
            );
            // Don't throw here, just log the error
          } else {
            console.log(
              `Successfully deleted image for subcategory ${id} from URL: ${categoryData.image_url}`
            );
          }
        } catch (imageError) {
          // Log the error but don't fail the entire operation
          console.error(
            `Failed to delete image for subcategory ${id}:`,
            imageError
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting sub category:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete sub category'
      );
    }
  }

  /**
   * Bulk delete sub categories
   */
  static async bulkDeleteSubCategories(
    ids: string[]
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: true,
      processedCount: 0,
      errors: []
    };

    for (const id of ids) {
      try {
        await this.deleteSubCategory(id);
        result.processedCount++;
      } catch (error) {
        result.success = false;
        result.errors.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return result;
  }

  /**
   * Get sub categories by parent category ID
   */
  static async getSubCategoriesByParent(
    parentCategoryId: string
  ): Promise<SubCategory[]> {
    try {
      const { data: categories, error } = await this.supabase
        .from('resource_sub_categories')
        .select('*')
        .eq('parent_category_id', parentCategoryId)
        .eq('status', 'active')
        .order('display_order');

      if (error) throw error;

      return categories || [];
    } catch (error) {
      console.error('Error fetching sub categories by parent:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch sub categories'
      );
    }
  }

  /**
   * Get sub categories for dropdown/select components
   */
  static async getSubCategoriesForSelect(parentCategoryId?: string): Promise<
    Array<{
      id: string;
      name: string;
      parent_category_id: string;
      parent_category_name?: string;
    }>
  > {
    try {
      let query = this.supabase
        .from('resource_sub_categories')
        .select(
          `
          id, 
          name, 
          parent_category_id,
          parent_category:resource_parent_categories(name)
        `
        )
        .eq('status', 'active');

      if (parentCategoryId) {
        query = query.eq('parent_category_id', parentCategoryId);
      }

      query = query.order('name');

      const { data: categories, error } = await query;

      if (error) throw error;

      return (categories || []).map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        parent_category_id: cat.parent_category_id,
        parent_category_name: cat.parent_category?.[0]?.name
      }));
    } catch (error) {
      console.error('Error fetching sub categories for select:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch sub categories'
      );
    }
  }

  // ===== ATTRIBUTE DEFINITION METHODS =====
  // DEPRECATED (2025-01-20): These methods are obsolete and should not be used.
  // Custom attributes are now managed per-resource in resources.custom_attributes JSONB column.
  // These methods are kept for backward compatibility only.

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Create attribute definitions for a sub category
   */
  static async createAttributeDefinitions(
    subcategoryId: string,
    attributeDefinitions: CreateAttributeDefinitionDto[]
  ): Promise<AttributeDefinition[]> {
    try {
      const attributesData = attributeDefinitions.map((attr, index) => ({
        subcategory_id: subcategoryId,
        attribute_key: attr.attribute_key.toLowerCase().replace(/\s+/g, '_'),
        attribute_type: attr.attribute_type,
        is_required: attr.is_required,
        is_multiple: attr.is_multiple,
        default_value: attr.default_value,
        options: attr.options,
        validation_rules: attr.validation_rules,
        display_order: attr.display_order || index + 1,
        description: attr.description
      }));

      const query: any = this.supabase
        .from('resource_attribute_definitions');

      const { data: attributes, error } = await query
        .insert(attributesData)
        .select();

      if (error) throw error;

      return attributes || [];
    } catch (error) {
      console.error('Error creating attribute definitions:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to create attribute definitions'
      );
    }
  }

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Get attribute definitions for a sub category
   */
  static async getAttributeDefinitions(
    subcategoryId: string
  ): Promise<AttributeDefinition[]> {
    try {
      const { data: attributes, error } = await this.supabase
        .from('resource_attribute_definitions')
        .select('*')
        .eq('subcategory_id', subcategoryId)
        .order('display_order');

      if (error) throw error;

      return (attributes || []) as AttributeDefinition[];
    } catch (error) {
      console.error('Error fetching attribute definitions:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch attribute definitions'
      );
    }
  }

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Update attribute definition
   */
  static async updateAttributeDefinition(
    id: string,
    attributeData: UpdateAttributeDefinitionDto
  ): Promise<AttributeDefinition> {
    try {
      const updateData = {
        ...attributeData,
        ...(attributeData.attribute_key && {
          attribute_key: attributeData.attribute_key
            .toLowerCase()
            .replace(/\s+/g, '_')
        }),
        updated_at: new Date().toISOString()
      };

      const query: any = this.supabase
        .from('resource_attribute_definitions');

      const { data: attribute, error } = await query
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return attribute;
    } catch (error) {
      console.error('Error updating attribute definition:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to update attribute definition'
      );
    }
  }

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Delete attribute definition
   */
  static async deleteAttributeDefinition(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('resource_attribute_definitions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error deleting attribute definition:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to delete attribute definition'
      );
    }
  }

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Update display order of attribute definitions
   */
  static async updateAttributeDisplayOrder(
    attributeOrders: Array<{ id: string; display_order: number }>
  ): Promise<boolean> {
    try {
      const updates = attributeOrders.map(({ id, display_order }) => {
        const query: any = this.supabase
          .from('resource_attribute_definitions');
        return query
          .update({
            display_order,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
      });

      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error('Error updating attribute display order:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to update attribute display order'
      );
    }
  }

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Validate attribute value based on definition
   */
  static validateAttributeValue(
    definition: AttributeDefinition,
    value: any
  ): { isValid: boolean; error?: string } {
    // Required field check
    if (
      definition.is_required &&
      (value === null || value === undefined || value === '')
    ) {
      return {
        isValid: false,
        error: `${definition.attribute_key} is required`
      };
    }

    // Skip validation if value is empty and not required
    if (
      !definition.is_required &&
      (value === null || value === undefined || value === '')
    ) {
      return { isValid: true };
    }

    // Type-specific validation
    switch (definition.attribute_type) {
      case 'number':
        if (isNaN(Number(value))) {
          return {
            isValid: false,
            error: `${definition.attribute_key} must be a valid number`
          };
        }
        break;

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return {
            isValid: false,
            error: `${definition.attribute_key} must be a valid email address`
          };
        }
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          return {
            isValid: false,
            error: `${definition.attribute_key} must be a valid URL`
          };
        }
        break;

      case 'date':
        if (isNaN(Date.parse(value))) {
          return {
            isValid: false,
            error: `${definition.attribute_key} must be a valid date`
          };
        }
        break;

      case 'dropdown':
        if (definition.options && !definition.options.includes(value)) {
          return {
            isValid: false,
            error: `${
              definition.attribute_key
            } must be one of: ${definition.options.join(', ')}`
          };
        }
        break;
    }

    // Custom validation rules
    if (definition.validation_rules) {
      const rules = definition.validation_rules;

      if (rules.minLength && value.length < rules.minLength) {
        return {
          isValid: false,
          error: `${definition.attribute_key} must be at least ${rules.minLength} characters`
        };
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        return {
          isValid: false,
          error: `${definition.attribute_key} must not exceed ${rules.maxLength} characters`
        };
      }

      if (rules.pattern) {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(value)) {
          return {
            isValid: false,
            error: `${definition.attribute_key} does not match the required format`
          };
        }
      }
    }

    return { isValid: true };
  }

  /**
   * @deprecated Use resource-level custom attributes instead (resources.custom_attributes)
   * Validate multiple attribute values
   */
  static validateAttributeValues(
    definitions: AttributeDefinition[],
    values: Record<string, any>
  ): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    for (const definition of definitions) {
      const value = values[definition.attribute_key];
      const validation = this.validateAttributeValue(definition, value);

      if (!validation.isValid && validation.error) {
        errors[definition.attribute_key] = validation.error;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}
