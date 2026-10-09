import type {
  ScholarshipValueMode,
  ScholarshipCategoryWithTypes,
  ScholarshipType
} from '@/types/billing-schedule';

/**
 * What picking a Type pre-fills on the Apply / Edit form. The applier can still
 * override both; a type with no default value leaves the value box alone.
 */
export function resolveTypeDefaults(
  type: Pick<ScholarshipType, 'default_value_mode' | 'default_value'>
): { value_mode: ScholarshipValueMode; scholarship_value?: number } {
  return {
    value_mode: type.default_value_mode,
    ...(type.default_value != null
      ? { scholarship_value: Number(type.default_value) }
      : {})
  };
}

/** Active categories, plus the one already on the record if it was since retired. */
export function selectableCategories(
  tree: ScholarshipCategoryWithTypes[],
  keepCategoryId?: string
): ScholarshipCategoryWithTypes[] {
  return tree.filter((c) => c.is_active || c.id === keepCategoryId);
}

/** Active types of one category, plus the one already on the record if retired. */
export function selectableTypes(
  tree: ScholarshipCategoryWithTypes[],
  categoryId: string | undefined,
  keepTypeId?: string
): ScholarshipType[] {
  if (!categoryId) return [];
  const category = tree.find((c) => c.id === categoryId);
  if (!category) return [];
  return category.types.filter((t) => t.is_active || t.id === keepTypeId);
}

/**
 * Client-side mirror of the database's composite FK: a type must exist, belong
 * to the chosen category, and (for a NEW selection) be active.
 * Returns an error message, or null when the pair is acceptable.
 */
export function validateScholarshipSelection(
  tree: ScholarshipCategoryWithTypes[],
  categoryId: string | undefined,
  typeId: string | undefined,
  opts: { allowInactiveCategoryId?: string; allowInactiveTypeId?: string } = {}
): string | null {
  if (!categoryId) return 'Please select a scholarship category';
  const category = tree.find((c) => c.id === categoryId);
  if (!category) return 'Selected scholarship category no longer exists';
  if (!category.is_active && categoryId !== opts.allowInactiveCategoryId) {
    return 'Selected scholarship category is inactive';
  }
  if (!typeId) return 'Please select a scholarship type';
  const type = category.types.find((t) => t.id === typeId);
  if (!type) return 'Selected scholarship type does not belong to this category';
  if (!type.is_active && typeId !== opts.allowInactiveTypeId) {
    return 'Selected scholarship type is inactive';
  }
  return null;
}

/** 'Merit Scholarship' -> 'merit_scholarship'. Matches the DB code CHECK. */
export function slugifyCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Appends _2, _3… until the code is not in `taken`. */
export function uniqueCode(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || 'item';
  if (!used.has(root)) return root;
  let n = 2;
  while (used.has(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
}
