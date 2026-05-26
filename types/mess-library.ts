// ============================================================================
// Mess Menu Item Library — Type definitions
// ============================================================================
// Mirrors public.mess_menu_item_library (introduced in PR #1091, migration
// supabase/migrations/20260701000000_mess_menu_item_library.sql).
//
// The library is a global reference catalogue of ~330 common South Indian
// hostel mess items. Menu editors pick from this catalogue when filling in
// weekly menu cells (mess_menus); the picker widget lives in the parallel
// Mess Menu admin UI (consumes ItemLibraryService + useItemSearch).
// ============================================================================

export type MessLibraryCategory =
  | 'breakfast'
  | 'lunch'
  | 'tea'
  | 'dinner'
  | 'sweet'
  | 'condiment'
  | 'beverage'
  | 'side';

export const MESS_LIBRARY_CATEGORIES: readonly MessLibraryCategory[] = [
  'breakfast',
  'lunch',
  'tea',
  'dinner',
  'sweet',
  'condiment',
  'beverage',
  'side',
] as const;

export type MessLibraryDietaryTag =
  | 'veg'
  | 'egg'
  | 'non_veg'
  | 'jain'
  | 'gluten_free'
  | 'dairy_free';

export interface MessMenuItemLibrary {
  id: string;
  name_tamil: string | null;
  name_english: string;
  category: MessLibraryCategory;
  dietary_tags: string[];
  region_typical: string | null;
  usage_count: number;
  is_active: boolean;
  needs_native_review: boolean;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface CreateMessMenuItemLibraryDTO {
  name_english: string;
  category: MessLibraryCategory;
  name_tamil?: string | null;
  dietary_tags?: string[];
  region_typical?: string | null;
  is_active?: boolean;
  needs_native_review?: boolean;
}

export type UpdateMessMenuItemLibraryDTO = Partial<
  Omit<CreateMessMenuItemLibraryDTO, 'name_english' | 'category'>
> & {
  // Allow renaming/re-categorising too, but keep them explicit so a caller
  // has to think about uniqueness implications (UNIQUE(name_english, category)).
  name_english?: string;
  category?: MessLibraryCategory;
  // Audit-trail field — set by markNativeReviewed and bulk-review flows.
  updated_by?: string | null;
};

// ── Filter / search / sort options ────────────────────────────────────────
export type MessLibrarySortOption = 'popular' | 'newest' | 'alphabetical';

export interface MessLibraryFilters {
  category?: MessLibraryCategory;
  dietaryTags?: string[];
  needsNativeReview?: boolean;
  isActive?: boolean; // defaults to true at service layer
  search?: string;
  sort?: MessLibrarySortOption;
  page?: number;
  pageSize?: number;
}

export interface MessLibraryListResult {
  data: MessMenuItemLibrary[];
  count: number;
}
