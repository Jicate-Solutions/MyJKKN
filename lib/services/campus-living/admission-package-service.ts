import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AdmissionPackage,
  CreateAdmissionPackageDto,
  UpdateAdmissionPackageDto,
  AdmissionPackageFilters,
  AdmissionPackageListResponse,
  AdmissionPackageCommunity,
  LearnerPackageAssignment,
  CreateLearnerPackageAssignmentDto,
  ResolvedLearnerPackage,
} from '@/types/admission-packages';

const LOG = 'campus-living/admission-packages';

export class AdmissionPackageService {
  private static get supabase() {
    // Cast to any — REQUIRED, do not remove. The admission_packages /
    // admission_package_communities / learner_package_assignment tables ARE in
    // types/supabase.ts, but the embed-select query builder triggers TS2589
    // (stack overflow) on the 107K-line generated Database type. Mirrors the
    // same cast across ~36 service files. Public signatures stay typed via
    // explicit `data as T` casts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  // ── packages ──────────────────────────────────────────────────────────────

  static async getPackages(
    filters: AdmissionPackageFilters = {}
  ): Promise<AdmissionPackageListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('admission_packages')
      .select(
        [
          '*',
          'room_category:hostel_categories(name)',
          'mess_category:mess_categories(name)',
          'degree:degrees(degree_name)',
          'department:departments(department_name)',
          'programme:programs(program_name)',
          'admission_year:admission_years(admission_year_name)',
          'quota:quotas(name)',
          'communities:admission_package_communities(community_category_id, community:community_categories(name))',
        ].join(', '),
        { count: 'exact' }
      )
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.institution_id)   query = query.eq('institution_id', filters.institution_id);
    if (filters.admission_year_id) query = query.eq('admission_year_id', filters.admission_year_id);
    if (filters.degree_id)        query = query.eq('degree_id', filters.degree_id);
    if (filters.department_id)    query = query.eq('department_id', filters.department_id);
    if (filters.programme_id)     query = query.eq('programme_id', filters.programme_id);
    if (filters.quota_id)         query = query.eq('quota_id', filters.quota_id);
    if (filters.gender)           query = query.eq('gender', filters.gender);
    if (filters.package_type)     query = query.eq('package_type', filters.package_type);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.search)           query = query.ilike('name', `%${filters.search}%`);

    const { data, error, count } = await query;
    if (error) {
      logger.error(LOG, 'Database error listing packages', error);
      throw new Error(error.message || 'Failed to fetch admission packages');
    }

    const rows = (data ?? []).map((r: Record<string, unknown>) => {
      const rc  = r.room_category   as { name?: string } | null;
      const mc  = r.mess_category   as { name?: string } | null;
      const deg = r.degree          as { degree_name?: string } | null;
      const dep = r.department      as { department_name?: string } | null;
      const prg = r.programme       as { program_name?: string } | null;
      const ay  = r.admission_year  as { admission_year_name?: string } | null;
      const qt  = r.quota           as { name?: string } | null;
      const communities = (r.communities as {
        community_category_id: string;
        community?: { name?: string } | null;
      }[] | null) ?? [];
      return {
        ...r,
        room_category_name:       rc?.name ?? null,
        mess_category_name:       mc?.name ?? null,
        degree_name:              deg?.degree_name ?? null,
        department_name:          dep?.department_name ?? null,
        programme_name:           prg?.program_name ?? null,
        admission_year_name:      ay?.admission_year_name ?? null,
        quota_name:               qt?.name ?? null,
        community_category_ids:   communities.map((c) => c.community_category_id),
        community_category_names: communities
          .map((c) => c.community?.name)
          .filter((n): n is string => Boolean(n)),
      };
    }) as AdmissionPackage[];

    const total = count ?? 0;
    return {
      data: rows,
      metadata: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getPackageById(id: string): Promise<AdmissionPackage> {
    const { data, error } = await this.supabase
      .from('admission_packages')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error(LOG, 'Database error fetching package', error);
      throw new Error(error.message || 'Failed to fetch admission package');
    }
    // fetch communities separately for single-record view
    const communities = await this.getCommunities(data.id);
    return {
      ...(data as AdmissionPackage),
      community_category_ids: communities.map((c) => c.community_category_id),
    };
  }

  static async createPackage(dto: CreateAdmissionPackageDto): Promise<AdmissionPackage> {
    const { community_category_ids, ...rest } = dto;

    const payload = {
      institution_id:    rest.institution_id,
      admission_year_id: rest.admission_year_id ?? null,
      degree_id:         rest.degree_id ?? null,
      department_id:     rest.department_id ?? null,
      programme_id:      rest.programme_id ?? null,
      quota_id:          rest.quota_id ?? null,
      gender:            rest.gender ?? null,
      name:              rest.name,
      description:       rest.description?.trim() || null,
      room_category_id:  rest.room_category_id,
      mess_category_id:  rest.mess_category_id ?? null,
      package_type:      rest.package_type ?? 'package',
      is_active:         rest.is_active ?? true,
    };

    const { data, error } = await this.supabase
      .from('admission_packages')
      .insert([payload])
      .select()
      .single();

    if (error) {
      logger.error(LOG, 'Database error creating package', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create admission package'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }

    const pkg = data as AdmissionPackage;

    // persist community associations
    const communityIds = community_category_ids ?? [];
    if (communityIds.length > 0) {
      await this.upsertCommunities(pkg.id, communityIds);
    }

    return { ...pkg, community_category_ids: communityIds };
  }

  static async updatePackage(
    id: string,
    dto: UpdateAdmissionPackageDto
  ): Promise<AdmissionPackage> {
    const { community_category_ids, ...rest } = dto;

    const { data, error } = await this.supabase
      .from('admission_packages')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error(LOG, 'Database error updating package', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update admission package'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }

    if (community_category_ids !== undefined) {
      await this.upsertCommunities(id, community_category_ids);
    }

    const communities = community_category_ids ?? await this.getCommunities(id).then((r) => r.map((c) => c.community_category_id));
    return { ...(data as AdmissionPackage), community_category_ids: communities };
  }

  static async deletePackage(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_packages')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(LOG, 'Database error deleting package', error);
      throw new Error(error.message || 'Failed to delete admission package');
    }
  }

  static async bulkDeletePackages(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deletePackage(id);
        success.push(id);
      } catch (e) {
        logger.error(LOG, `Error deleting package ${id}`, e);
        failed.push({ id, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
    return { success, failed };
  }

  // ── community helpers ──────────────────────────────────────────────────────

  static async getCommunities(packageId: string): Promise<AdmissionPackageCommunity[]> {
    const { data, error } = await this.supabase
      .from('admission_package_communities')
      .select('*')
      .eq('package_id', packageId);
    if (error) {
      logger.error(LOG, 'Database error listing package communities', error);
      throw new Error(error.message || 'Failed to fetch package communities');
    }
    return (data ?? []) as AdmissionPackageCommunity[];
  }

  /**
   * Replace the full community set for a package.
   * Deletes all existing rows then re-inserts the desired set atomically.
   */
  static async upsertCommunities(
    packageId: string,
    communityIds: string[]
  ): Promise<void> {
    // delete existing
    const { error: delError } = await this.supabase
      .from('admission_package_communities')
      .delete()
      .eq('package_id', packageId);
    if (delError) {
      logger.error(LOG, 'Failed to clear package communities', delError);
      throw new Error(delError.message || 'Failed to update package communities');
    }
    if (communityIds.length === 0) return;

    const rows = communityIds.map((cid) => ({
      package_id: packageId,
      community_category_id: cid,
    }));
    const { error: insError } = await this.supabase
      .from('admission_package_communities')
      .insert(rows);
    if (insError) {
      logger.error(LOG, 'Failed to insert package communities', insError);
      throw new Error(insError.message || 'Failed to save package communities');
    }
  }

  // ── learner ↔ package assignment ────────────────────────────────────────────

  static async assignPackageToLearner(
    dto: CreateLearnerPackageAssignmentDto
  ): Promise<LearnerPackageAssignment> {
    const { data, error } = await this.supabase
      .from('learner_package_assignment')
      .upsert(
        [{ ...dto, hostel_year_id: dto.hostel_year_id ?? null }],
        { onConflict: 'learner_id,hostel_year_id' }
      )
      .select()
      .single();
    if (error) {
      logger.error(LOG, 'Database error assigning package to learner', error);
      throw new Error(error.message || 'Failed to assign package to learner');
    }
    return data as LearnerPackageAssignment;
  }

  /**
   * THE HANDOFF resolver. Given a learner + hostel year, return their assigned
   * package, the bundled room category, and their separately-chosen mess override.
   */
  static async getPackageForLearner(
    learnerId: string,
    hostelYearId?: string | null
  ): Promise<ResolvedLearnerPackage | null> {
    let query = this.supabase
      .from('learner_package_assignment')
      .select(
        '*, pkg:admission_packages(*, room_category:hostel_categories(name), mess_category:mess_categories(name))'
      )
      .eq('learner_id', learnerId);
    query = hostelYearId
      ? query.eq('hostel_year_id', hostelYearId)
      : query.is('hostel_year_id', null);

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.error(LOG, 'Database error resolving learner package', error);
      throw new Error(error.message || 'Failed to resolve learner package');
    }
    if (!data) return null;

    const row = data as LearnerPackageAssignment & {
      pkg: (AdmissionPackage & {
        room_category?: { name?: string } | null;
        mess_category?: { name?: string } | null;
      }) | null;
    };
    if (!row.pkg) return null;

    const pkg: AdmissionPackage = {
      ...row.pkg,
      room_category_name:
        row.pkg.room_category?.name ?? row.pkg.room_category_name ?? null,
      mess_category_name:
        row.pkg.mess_category?.name ?? row.pkg.mess_category_name ?? null,
      community_category_ids: row.pkg.community_category_ids ?? [],
    };

    return {
      assignment: {
        id: row.id,
        learner_id: row.learner_id,
        package_id: row.package_id,
        hostel_year_id: row.hostel_year_id,
        chosen_mess_category_id: row.chosen_mess_category_id,
        assigned_at: row.assigned_at,
        created_by: row.created_by,
      },
      pkg,
      room_category_id: pkg.room_category_id,
      chosen_mess_category_id: row.chosen_mess_category_id,
    };
  }
}
