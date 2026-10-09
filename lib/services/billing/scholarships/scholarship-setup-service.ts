import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { slugifyCode, uniqueCode } from '@/lib/billing/scholarship-type-defaults';
import type {
  CreateScholarshipCategoryDto,
  CreateScholarshipTypeDto,
  ScholarshipCategory,
  ScholarshipCategoryWithTypes,
  ScholarshipType,
  UpdateScholarshipCategoryDto,
  UpdateScholarshipTypeDto
} from '@/types/billing-schedule';

// Scholarship categories and the types under them. Global lists (no
// institution_id), same stance as billing_categories. Reads are open to any
// signed-in user — the Apply form needs them — and writes are gated by RLS on
// billing.scholarship_setup.* (see 20271009090000_scholarship_categories_and_types).

const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Postgres/PostgREST errors are plain objects, so map the codes by hand. */
function friendlyError(error: unknown, whatInUse: string): Error {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') return new Error('That name or code already exists');
  if (code === '23503') {
    return new Error(`${whatInUse} is in use — deactivate it instead of deleting`);
  }
  if (code === '23514') return new Error('One of the values is out of range');
  if (code === '42501') {
    return new Error("You don't have permission to change scholarship categories or types");
  }
  return new Error(getErrorMessage(error));
}

/** Escapes % and _ so a name is matched literally by ilike. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class ScholarshipSetupService {
  private static supabase = createClientSupabaseClient();

  private static async currentUserId(): Promise<string | null> {
    const {
      data: { user }
    } = await this.supabase.auth.getUser();
    return user?.id ?? null;
  }

  /** Every category with its types, ordered. Inactive rows are included — the
   *  caller filters (the edit form must still show a since-retired selection). */
  static async listCategoriesWithTypes(): Promise<ScholarshipCategoryWithTypes[]> {
    const { data, error } = await this.supabase
      .from('billing_scholarship_categories')
      .select('*, types:billing_scholarship_types(*)');

    if (error) throw friendlyError(error, 'Scholarship category');

    const rows = (data ?? []) as unknown as ScholarshipCategoryWithTypes[];
    return rows
      .map((c) => ({ ...c, types: [...(c.types ?? [])].sort(byOrder) }))
      .sort(byOrder);
  }

  // ── Categories ────────────────────────────────────────────────────────────

  static async createCategory(
    dto: CreateScholarshipCategoryDto
  ): Promise<ScholarshipCategory> {
    const name = dto.name.trim();
    if (!name) throw new Error('Category name is required');

    const { data: existing, error: listError } = await this.supabase
      .from('billing_scholarship_categories')
      .select('code, name');
    if (listError) throw friendlyError(listError, 'Scholarship category');

    if ((existing ?? []).some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Scholarship category "${name}" already exists`);
    }
    const code = uniqueCode(
      slugifyCode(name) || 'category',
      (existing ?? []).map((c) => c.code)
    );

    const userId = await this.currentUserId();
    const { data, error } = await this.supabase
      .from('billing_scholarship_categories')
      .insert({
        code,
        name,
        description: dto.description?.trim() || null,
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
        created_by: userId,
        updated_by: userId
      })
      .select('*')
      .single();

    if (error) throw friendlyError(error, 'Scholarship category');
    return data as ScholarshipCategory;
  }

  static async updateCategory(
    id: string,
    dto: UpdateScholarshipCategoryDto
  ): Promise<ScholarshipCategory> {
    const patch: Record<string, unknown> = { updated_by: await this.currentUserId() };

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new Error('Category name is required');
      const { data: clash, error: clashError } = await this.supabase
        .from('billing_scholarship_categories')
        .select('id')
        .ilike('name', likeLiteral(name))
        .neq('id', id)
        .limit(1);
      if (clashError) throw friendlyError(clashError, 'Scholarship category');
      if ((clash ?? []).length > 0) {
        throw new Error(`Scholarship category "${name}" already exists`);
      }
      patch.name = name;
    }
    if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
    if (dto.sort_order !== undefined) patch.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) patch.is_active = dto.is_active;

    const { data, error } = await this.supabase
      .from('billing_scholarship_categories')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw friendlyError(error, 'Scholarship category');
    return data as ScholarshipCategory;
  }

  static async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('billing_scholarship_categories')
      .delete()
      .eq('id', id);
    if (error) throw friendlyError(error, 'This category (or one of its types)');
  }

  // ── Types ─────────────────────────────────────────────────────────────────

  static async createType(dto: CreateScholarshipTypeDto): Promise<ScholarshipType> {
    const name = dto.name.trim();
    if (!name) throw new Error('Type name is required');

    const { data: siblings, error: listError } = await this.supabase
      .from('billing_scholarship_types')
      .select('code, name')
      .eq('category_id', dto.category_id);
    if (listError) throw friendlyError(listError, 'Scholarship type');

    if ((siblings ?? []).some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Scholarship type "${name}" already exists in this category`);
    }
    const code = uniqueCode(
      slugifyCode(name) || 'type',
      (siblings ?? []).map((t) => t.code)
    );

    const userId = await this.currentUserId();
    const { data, error } = await this.supabase
      .from('billing_scholarship_types')
      .insert({
        category_id: dto.category_id,
        code,
        name,
        description: dto.description?.trim() || null,
        default_value_mode: dto.default_value_mode,
        default_value: dto.default_value ?? null,
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
        created_by: userId,
        updated_by: userId
      })
      .select('*')
      .single();

    if (error) throw friendlyError(error, 'Scholarship type');
    return data as ScholarshipType;
  }

  static async updateType(
    id: string,
    dto: UpdateScholarshipTypeDto
  ): Promise<ScholarshipType> {
    const patch: Record<string, unknown> = { updated_by: await this.currentUserId() };

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new Error('Type name is required');
      const { data: current, error: currentError } = await this.supabase
        .from('billing_scholarship_types')
        .select('category_id')
        .eq('id', id)
        .single();
      if (currentError) throw friendlyError(currentError, 'Scholarship type');

      const { data: clash, error: clashError } = await this.supabase
        .from('billing_scholarship_types')
        .select('id')
        .eq('category_id', current.category_id)
        .ilike('name', likeLiteral(name))
        .neq('id', id)
        .limit(1);
      if (clashError) throw friendlyError(clashError, 'Scholarship type');
      if ((clash ?? []).length > 0) {
        throw new Error(`Scholarship type "${name}" already exists in this category`);
      }
      patch.name = name;
    }
    if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
    if (dto.default_value_mode !== undefined) patch.default_value_mode = dto.default_value_mode;
    if (dto.default_value !== undefined) patch.default_value = dto.default_value;
    if (dto.sort_order !== undefined) patch.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) patch.is_active = dto.is_active;

    const { data, error } = await this.supabase
      .from('billing_scholarship_types')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw friendlyError(error, 'Scholarship type');
    return data as ScholarshipType;
  }

  static async deleteType(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('billing_scholarship_types')
      .delete()
      .eq('id', id);
    if (error) throw friendlyError(error, 'This type');
  }
}
