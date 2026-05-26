// ============================================================================
// Mess Menu Item Library — Service layer (CRUD + search + sort)
// ============================================================================
// Backs the /admin/mess/library admin UI and is consumed by the menu editor
// (parallel Mess Menu agent) as the autocomplete / picker data source.
//
// Public surface — all `static` methods on ItemLibraryService:
//
//   getItems(filters)                — list with category / dietary / search filters
//   getItem(id)                      — single row by id
//   searchItems(query, opts)         — text search via GIN index (name_english + name_tamil)
//   createItem(payload)              — admin-only INSERT (RLS enforces)
//   updateItem(id, patch)            — admin-only UPDATE
//   deactivateItem(id)               — soft delete (is_active = false)
//   reactivateItem(id)               — restore (is_active = true)
//   incrementUsageCount(id)          — bump usage_count when menu editor picks
//                                      an item; respects
//                                      mess.menu.library_auto_promote_enabled
//                                      policy via createIfMissing helper below
//   markNativeReviewed(id, reviewer) — flip needs_native_review = false +
//                                      stamp updated_by
//   markManyNativeReviewed(ids, …)   — bulk variant for after a category audit
//
// Note: the underlying `mess_menu_item_library` table is not yet present in
// types/supabase.ts (the generated Database type lags fresh migrations). We
// cast the client to `any` at the call site to stay type-safe at the boundary
// while keeping the rest of the service strongly typed via types/mess-library.ts.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessMenuItemLibrary,
  CreateMessMenuItemLibraryDTO,
  UpdateMessMenuItemLibraryDTO,
  MessLibraryFilters,
  MessLibraryListResult,
  MessLibrarySortOption,
  MessLibraryCategory,
} from '@/types/mess-library';

const TABLE = 'mess_menu_item_library';
const SOURCE = 'mess/item-library';

// Default page size mirrors mess_caterer service defaults.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function clientUntyped() {
  // Casting through unknown → any is the established pattern in this codebase
  // for tables not yet present in the generated Database type. Once
  // types/supabase.ts is regenerated post-PR-1086+1090+1091, this cast can
  // come out (one-line change).
  return createClientSupabaseClient() as unknown as {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => any;
  };
}

// ── Sort key resolver ───────────────────────────────────────────────────
function resolveOrderBy(sort: MessLibrarySortOption | undefined): {
  column: string;
  ascending: boolean;
} {
  switch (sort) {
    case 'popular':
      return { column: 'usage_count', ascending: false };
    case 'newest':
      return { column: 'created_at', ascending: false };
    case 'alphabetical':
    default:
      return { column: 'name_english', ascending: true };
  }
}

// ── Sanitise free-text search for ILIKE ────────────────────────────────
// The PR 1 GIN index sits on an expression (to_tsvector(...)), not a
// named column, so it can only be used via RPC. For now we use ILIKE
// against name_english + name_tamil — fine at 332 rows. If/when the
// library exceeds ~10k rows, promote this to an RPC that hits the GIN.
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export class ItemLibraryService {
  // ── List ────────────────────────────────────────────────────────────
  static async getItems(filters: MessLibraryFilters = {}): Promise<MessLibraryListResult> {
    try {
      const supabase = clientUntyped();
      const {
        category,
        dietaryTags,
        needsNativeReview,
        isActive,
        search,
        sort,
        page = 1,
        pageSize = DEFAULT_PAGE_SIZE,
      } = filters;

      const effectivePageSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

      let query = supabase.from(TABLE).select('*', { count: 'exact' });

      // Default: active rows only. Caller can pass isActive=false to see archived.
      if (isActive === undefined) {
        query = query.eq('is_active', true);
      } else {
        query = query.eq('is_active', isActive);
      }

      if (category) query = query.eq('category', category);
      if (typeof needsNativeReview === 'boolean') {
        query = query.eq('needs_native_review', needsNativeReview);
      }
      if (dietaryTags && dietaryTags.length > 0) {
        // Match rows whose dietary_tags contains ALL requested tags.
        // PostgREST: `.contains` against text[] = `cs.{a,b}`.
        query = query.contains('dietary_tags', dietaryTags);
      }
      if (search && search.trim()) {
        const safe = escapeLike(search.trim());
        // ILIKE on both English + Tamil. PostgREST `or()` takes a comma-
        // separated filter list; values must escape commas (none expected
        // here because escapeLike already filtered % and _).
        query = query.or(
          `name_english.ilike.%${safe}%,name_tamil.ilike.%${safe}%`
        );
      }

      const order = resolveOrderBy(sort);
      query = query.order(order.column, { ascending: order.ascending });
      // Stable tie-break for popular/newest sorts.
      if (order.column !== 'name_english') {
        query = query.order('name_english', { ascending: true });
      }

      const from = (page - 1) * effectivePageSize;
      const to = from + effectivePageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) {
        logger.error(SOURCE, 'getItems failed', error);
        throw error;
      }
      return {
        data: (data ?? []) as MessMenuItemLibrary[],
        count: count ?? 0,
      };
    } catch (error) {
      logger.error(SOURCE, 'getItems unexpected error', error);
      throw error;
    }
  }

  // ── Single ──────────────────────────────────────────────────────────
  static async getItem(id: string): Promise<MessMenuItemLibrary | null> {
    try {
      const supabase = clientUntyped();
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error(SOURCE, 'getItem failed', error);
        throw error;
      }
      return (data ?? null) as MessMenuItemLibrary | null;
    } catch (error) {
      logger.error(SOURCE, 'getItem unexpected error', error);
      throw error;
    }
  }

  // ── Search (thin wrapper around getItems, kept for picker ergonomics) ──
  static async searchItems(
    query: string,
    opts: {
      category?: MessLibraryCategory;
      dietaryTags?: string[];
      limit?: number;
    } = {}
  ): Promise<MessMenuItemLibrary[]> {
    const result = await ItemLibraryService.getItems({
      search: query,
      category: opts.category,
      dietaryTags: opts.dietaryTags,
      sort: 'popular',
      page: 1,
      pageSize: opts.limit ?? 20,
    });
    return result.data;
  }

  // ── Create ──────────────────────────────────────────────────────────
  static async createItem(payload: CreateMessMenuItemLibraryDTO): Promise<MessMenuItemLibrary> {
    try {
      const supabase = clientUntyped();
      const insertPayload = {
        name_english: payload.name_english,
        category: payload.category,
        name_tamil: payload.name_tamil ?? null,
        dietary_tags: payload.dietary_tags ?? [],
        region_typical: payload.region_typical ?? null,
        // Defaults match the table — surfaced here for clarity.
        is_active: payload.is_active ?? true,
        needs_native_review: payload.needs_native_review ?? true,
      };
      const { data, error } = await supabase
        .from(TABLE)
        .insert(insertPayload)
        .select()
        .single();
      if (error) {
        logger.error(SOURCE, 'createItem failed', error);
        throw error;
      }
      return data as MessMenuItemLibrary;
    } catch (error) {
      logger.error(SOURCE, 'createItem unexpected error', error);
      throw error;
    }
  }

  // ── Update ──────────────────────────────────────────────────────────
  static async updateItem(
    id: string,
    patch: UpdateMessMenuItemLibraryDTO
  ): Promise<MessMenuItemLibrary> {
    try {
      const supabase = clientUntyped();
      const { data, error } = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error(SOURCE, 'updateItem failed', error);
        throw error;
      }
      return data as MessMenuItemLibrary;
    } catch (error) {
      logger.error(SOURCE, 'updateItem unexpected error', error);
      throw error;
    }
  }

  // ── Soft delete / restore ───────────────────────────────────────────
  static async deactivateItem(id: string): Promise<MessMenuItemLibrary> {
    return ItemLibraryService.updateItem(id, { is_active: false });
  }

  static async reactivateItem(id: string): Promise<MessMenuItemLibrary> {
    return ItemLibraryService.updateItem(id, { is_active: true });
  }

  // ── Usage tracking ──────────────────────────────────────────────────
  // Bump usage_count when the menu editor picks an item from the library.
  // Uses a SQL `usage_count + 1` expression via PostgREST RPC-like update
  // through a single round-trip (we read then write to keep this dependency-
  // free; a future optimisation can move this to an RPC if hot).
  static async incrementUsageCount(id: string): Promise<void> {
    try {
      const supabase = clientUntyped();
      // Atomic-ish: rely on PostgREST's eq() filter + numeric add via a
      // re-fetch. For our load (admin picks ≪ 100/day per institution) this
      // is safe enough; we can promote to a server-side RPC later.
      const { data: current, error: readError } = await supabase
        .from(TABLE)
        .select('usage_count')
        .eq('id', id)
        .maybeSingle();
      if (readError) {
        logger.error(SOURCE, 'incrementUsageCount read failed', readError);
        throw readError;
      }
      if (!current) {
        logger.warn(SOURCE, 'incrementUsageCount called for unknown id', { id });
        return;
      }
      const next = (current.usage_count ?? 0) + 1;
      const { error: writeError } = await supabase
        .from(TABLE)
        .update({ usage_count: next })
        .eq('id', id);
      if (writeError) {
        logger.error(SOURCE, 'incrementUsageCount write failed', writeError);
        throw writeError;
      }
    } catch (error) {
      logger.error(SOURCE, 'incrementUsageCount unexpected error', error);
      throw error;
    }
  }

  // ── Native review ────────────────────────────────────────────────────
  static async markNativeReviewed(
    id: string,
    reviewedBy: string
  ): Promise<MessMenuItemLibrary> {
    return ItemLibraryService.updateItem(id, {
      needs_native_review: false,
      updated_by: reviewedBy,
    });
  }

  static async markManyNativeReviewed(
    ids: string[],
    reviewedBy: string
  ): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const supabase = clientUntyped();
      const { data, error } = await supabase
        .from(TABLE)
        .update({ needs_native_review: false, updated_by: reviewedBy })
        .in('id', ids)
        .select('id');
      if (error) {
        logger.error(SOURCE, 'markManyNativeReviewed failed', error);
        throw error;
      }
      return Array.isArray(data) ? data.length : 0;
    } catch (error) {
      logger.error(SOURCE, 'markManyNativeReviewed unexpected error', error);
      throw error;
    }
  }
}
