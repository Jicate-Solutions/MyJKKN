import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  SchoolMaster,
  SchoolMasterDistrict,
  SchoolMasterFilters,
  CreateSchoolMasterInput,
  UpdateSchoolMasterInput,
  SchoolMasterImportRow,
  SchoolMasterImportResult,
} from '@/types/school-master';

/**
 * School Master — global lookup table (no institution scoping) behind the
 * Last School dropdown. Reads are open to all authenticated users via RLS;
 * writes are gated on learners.school_master.* permission keys.
 *
 * Every mutation destructures { error } and surfaces it — never silent.
 */
export class SchoolMasterService {
  /** Districts that actually have active schools for a board (with counts). */
  static async getDistricts(board = 'state_board'): Promise<SchoolMasterDistrict[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_school_master_districts', {
      p_board: board,
    });
    if (error) throw error;
    return (data ?? []) as SchoolMasterDistrict[];
  }

  /**
   * Paginated, server-side-searched school list. Search uses ILIKE contains
   * (backed by the trigram index). Never relies on a default limit.
   */
  static async getSchools(filters: SchoolMasterFilters): Promise<{
    schools: SchoolMaster[];
    total: number;
  }> {
    const supabase = createClientSupabaseClient();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const from = (page - 1) * limit;

    // Whitelist sortable columns — sortBy comes from DataTable URL state.
    const SORTABLE = new Set([
      'school_name', 'district', 'board', 'pincode', 'udise_code',
      'is_active', 'created_at',
    ]);
    const sortBy = filters.sortBy && SORTABLE.has(filters.sortBy) ? filters.sortBy : 'school_name';
    const ascending = filters.sortOrder !== 'desc';

    let query = supabase
      .from('school_master')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending })
      .range(from, from + limit - 1);

    if (filters.board) query = query.eq('board', filters.board);
    if (filters.district) query = query.eq('district', filters.district);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.search?.trim()) {
      // Escape PostgREST ILIKE wildcards in user input
      const term = filters.search.trim().replace(/[%_]/g, '\\$&');
      query = query.ilike('school_name', `%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { schools: (data ?? []) as SchoolMaster[], total: count ?? 0 };
  }

  static async getSchoolById(id: string): Promise<SchoolMaster | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_master')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as SchoolMaster | null;
  }

  /**
   * Exact (case/whitespace-insensitive) name match used to auto-link legacy
   * free-text last_school values when a record is opened for edit.
   */
  static async findByExactName(
    name: string,
    opts: { board?: string; district?: string } = {},
  ): Promise<SchoolMaster | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const supabase = createClientSupabaseClient();
    let query = supabase
      .from('school_master')
      .select('*')
      .ilike('school_name', trimmed.replace(/[%_]/g, '\\$&'))
      .eq('is_active', true)
      .limit(2);
    if (opts.board) query = query.eq('board', opts.board);
    if (opts.district) query = query.eq('district', opts.district);

    const { data, error } = await query;
    if (error) throw error;
    // Only auto-link when the match is unambiguous
    return data?.length === 1 ? (data[0] as SchoolMaster) : null;
  }

  static async create(input: CreateSchoolMasterInput): Promise<SchoolMaster> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_master')
      .insert({ ...input, school_name: input.school_name.trim() })
      .select('*')
      .single();
    if (error) throw error;
    return data as SchoolMaster;
  }

  static async update(id: string, input: UpdateSchoolMasterInput): Promise<SchoolMaster> {
    const supabase = createClientSupabaseClient();
    const payload = { ...input };
    if (payload.school_name) payload.school_name = payload.school_name.trim();
    const { data, error } = await supabase
      .from('school_master')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SchoolMaster;
  }

  static async delete(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await supabase.from('school_master').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Bulk import with client-side dedupe against the (board, district,
   * lower(name)) unique index — the index is expression-based, so PostgREST
   * upsert on_conflict can't target it; we pre-check instead and insert in
   * chunks, reporting skipped duplicates per row.
   */
  static async bulkImport(
    rows: SchoolMasterImportRow[],
    board = 'state_board',
  ): Promise<SchoolMasterImportResult> {
    const supabase = createClientSupabaseClient();
    const result: SchoolMasterImportResult = { inserted: 0, skippedDuplicates: 0, errors: [] };

    // Normalize + drop intra-file duplicates
    const seen = new Set<string>();
    const cleaned: (SchoolMasterImportRow & { _row: number })[] = [];
    rows.forEach((row, i) => {
      const name = row.school_name?.trim();
      const district = row.district?.trim();
      if (!name || !district) {
        result.errors.push({ row: i + 1, message: 'District and School Name are required' });
        return;
      }
      const key = `${district.toLowerCase()}|${name.toLowerCase()}`;
      if (seen.has(key)) {
        result.skippedDuplicates++;
        return;
      }
      seen.add(key);
      cleaned.push({ ...row, school_name: name, district, _row: i + 1 });
    });

    // Fetch existing names for the affected districts to skip DB duplicates
    const districts = [...new Set(cleaned.map((r) => r.district))];
    const existing = new Set<string>();
    for (const district of districts) {
      const { data, error } = await supabase
        .from('school_master')
        .select('school_name')
        .eq('board', board)
        .eq('district', district);
      if (error) throw error;
      for (const r of data ?? []) {
        existing.add(`${district.toLowerCase()}|${(r as { school_name: string }).school_name.toLowerCase()}`);
      }
    }

    const toInsert = cleaned.filter((r) => {
      const key = `${r.district.toLowerCase()}|${r.school_name.toLowerCase()}`;
      if (existing.has(key)) {
        result.skippedDuplicates++;
        return false;
      }
      return true;
    });

    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabase.from('school_master').insert(
        chunk.map((r) => ({
          school_name: r.school_name,
          district: r.district,
          board,
          pincode: r.pincode?.toString().trim() || null,
          udise_code: r.udise_code?.toString().trim() || null,
        })),
      );
      if (error) {
        result.errors.push({
          row: chunk[0]._row,
          message: `Batch insert failed: ${error.message ?? error.code ?? 'unknown error'}`,
        });
      } else {
        result.inserted += chunk.length;
      }
    }

    return result;
  }
}
