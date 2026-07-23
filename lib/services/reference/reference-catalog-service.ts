import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Reference / Masters hub — client service over the reference_catalogs
 * registry (Smile Care model rebuilt on MyJKKN's permission stack).
 *
 * All reads/writes go through three SECURITY DEFINER RPCs that are bound to
 * registry rows: the client only ever passes a catalog_key, never a table
 * name. Permission gates (view_permission / manage_permission per catalog)
 * are enforced inside the functions; RLS on reference_catalogs covers the
 * direct metadata read.
 *
 * Every call destructures { error } and surfaces it — never silent.
 */

export type ReferenceEditorMode = 'generic' | 'linked' | 'readonly';

export interface ReferenceCatalogCard {
  catalog_key: string;
  display_name: string;
  description: string | null;
  group_name: string;
  editor_mode: ReferenceEditorMode;
  external_route: string | null;
  sort_order: number;
  /** null when the seeded source table is missing (kept visible on purpose) */
  total_count: number | null;
  active_count: number | null;
}

export interface ReferenceFieldOption {
  value: string;
  label: string;
}

export interface ReferenceFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'fk';
  required?: boolean;
  editable?: boolean;
  show_in_list?: boolean;
  /** select: fixed choices stored in the registry config */
  options?: ReferenceFieldOption[];
  /** fk: dropdown options come from this table (resolved server-side) */
  fk_table?: string;
  fk_label_column?: string;
}

export interface ReferenceCatalogMeta {
  catalog_key: string;
  display_name: string;
  description: string | null;
  group_name: string;
  editor_mode: ReferenceEditorMode;
  external_route: string | null;
  label_column: string;
  columns_config: ReferenceFieldConfig[];
}

export interface ReferenceCatalogRow {
  id: string;
  is_active?: boolean | null;
  is_system?: boolean | null;
  [key: string]: unknown;
}

export interface ReferenceRowsPage {
  rows: ReferenceCatalogRow[];
  total: number;
}

export class ReferenceCatalogService {
  private static supabase = createClientSupabaseClient();

  /** Hub cards: registry metadata + live counts, one RPC round-trip. */
  static async getCards(): Promise<ReferenceCatalogCard[]> {
    const { data, error } = await this.supabase.rpc('fn_reference_catalog_cards');
    if (error) {
      throw new Error(`Failed to load reference catalogs: ${error.message}`);
    }
    return (data ?? []) as ReferenceCatalogCard[];
  }

  /** Registry metadata for one catalog (drives the browse table + form). */
  static async getCatalogMeta(catalogKey: string): Promise<ReferenceCatalogMeta> {
    const { data, error } = await this.supabase
      .from('reference_catalogs')
      .select(
        'catalog_key, display_name, description, group_name, editor_mode, external_route, label_column, columns_config'
      )
      .eq('catalog_key', catalogKey)
      .eq('is_active', true)
      .single();
    if (error) {
      throw new Error(`Failed to load catalog "${catalogKey}": ${error.message}`);
    }
    return {
      ...data,
      columns_config: (data.columns_config ?? []) as ReferenceFieldConfig[],
    } as ReferenceCatalogMeta;
  }

  /** Browse rows (server-side search + pagination inside the RPC). */
  static async getRows(
    catalogKey: string,
    search: string | null,
    page: number,
    pageSize: number
  ): Promise<ReferenceRowsPage> {
    const { data, error } = await this.supabase.rpc('fn_reference_catalog_rows', {
      p_catalog_key: catalogKey,
      p_search: search && search.trim().length > 0 ? search.trim() : null,
      p_limit: pageSize,
      p_offset: Math.max(page - 1, 0) * pageSize,
    });
    if (error) {
      throw new Error(`Failed to load rows for "${catalogKey}": ${error.message}`);
    }
    const payload = (data ?? { rows: [], total: 0 }) as {
      rows: ReferenceCatalogRow[];
      total: number;
    };
    return { rows: payload.rows ?? [], total: payload.total ?? 0 };
  }

  /**
   * Dropdown options for an fk field. The target table and label column are
   * resolved server-side from the registry row's field config — the client
   * only names the catalog and field.
   */
  static async getFkOptions(
    catalogKey: string,
    fieldKey: string
  ): Promise<ReferenceFieldOption[]> {
    const { data, error } = await this.supabase.rpc('fn_reference_catalog_fk_options', {
      p_catalog_key: catalogKey,
      p_field_key: fieldKey,
    });
    if (error) {
      throw new Error(`Failed to load options for "${fieldKey}": ${error.message}`);
    }
    return (data ?? []) as ReferenceFieldOption[];
  }

  /**
   * Create (rowId = null) or update a row in a generic catalog.
   * No delete exists by design — deactivate via is_active instead.
   */
  static async upsertRow(
    catalogKey: string,
    rowId: string | null,
    values: Record<string, unknown>
  ): Promise<{ id: string }> {
    const { data, error } = await this.supabase.rpc('fn_reference_catalog_upsert', {
      p_catalog_key: catalogKey,
      p_row_id: rowId,
      p_values: values,
    });
    if (error) {
      throw new Error(`Failed to save row in "${catalogKey}": ${error.message}`);
    }
    return data as { id: string };
  }
}
