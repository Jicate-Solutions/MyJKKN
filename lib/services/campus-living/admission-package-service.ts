import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AdmissionPackage,
  CreateAdmissionPackageDto,
  UpdateAdmissionPackageDto,
  AdmissionPackageFilters,
  AdmissionPackageListResponse,
  AdmissionPackageProgramEligibility,
  CreatePackageProgramEligibilityDto,
  LearnerPackageAssignment,
  CreateLearnerPackageAssignmentDto,
  ResolvedLearnerPackage,
} from '@/types/admission-packages';

const LOG = 'campus-living/admission-packages';

export class AdmissionPackageService {
  private static get supabase() {
    // Cast to any — REQUIRED, do not remove. The admission_packages /
    // admission_package_program_eligibility / learner_package_assignment tables
    // ARE now present in types/supabase.ts, yet removing this cast still makes
    // tsc abort (SIGABRT / stack overflow) on the embed-select query builder:
    // the failure is schema-SIZE driven TS2589 (a 107K-line generated Database
    // type), not a missing-table gap. Verified empirically 2026-05-30. Mirrors
    // the same cast across ~36 service files (e.g. premium-vacancy-service.ts).
    // Public method signatures stay typed via explicit `data as T` casts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  // ── packages ──────────────────────────────────────────────────────────
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
        '*, room_category:hostel_categories(name), hostel_year:hostel_years(name), program_eligibility:admission_package_program_eligibility(program_id)',
        { count: 'exact' }
      )
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.hostel_year_id) query = query.eq('hostel_year_id', filters.hostel_year_id);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);

    const { data, error, count } = await query;
    if (error) {
      logger.error(LOG, 'Database error listing packages', error);
      throw new Error(error.message || 'Failed to fetch admission packages');
    }

    // flatten the embedded join names + summarise program availability
    const rows = (data ?? []).map((r: Record<string, unknown>) => {
      const rc = r.room_category as { name?: string } | null;
      const hy = r.hostel_year as { name?: string } | null;
      const elig =
        (r.program_eligibility as { program_id: string | null }[] | null) ?? [];
      const specific = elig.filter((e) => e.program_id !== null);
      const hasAll = elig.some((e) => e.program_id === null);
      // available to all when an all-programs row exists and nothing overrides it
      const availableToAll = hasAll && specific.length === 0;
      return {
        ...r,
        room_category_name: rc?.name ?? null,
        hostel_year_name: hy?.name ?? null,
        available_to_all_programs: availableToAll,
        restricted_program_count: specific.length,
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
    return data as AdmissionPackage;
  }

  static async createPackage(
    dto: CreateAdmissionPackageDto
  ): Promise<AdmissionPackage> {
    const { data, error } = await this.supabase
      .from('admission_packages')
      .insert([dto])
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
    // default availability = all programs (program_id NULL), so a brand-new
    // package is usable immediately; per-program restriction is a refinement.
    const pkg = data as AdmissionPackage;
    try {
      await this.addProgramEligibility({ package_id: pkg.id, program_id: null });
    } catch (e) {
      logger.warn(LOG, 'package created but default all-programs eligibility insert failed', e);
    }
    return pkg;
  }

  static async updatePackage(
    id: string,
    dto: UpdateAdmissionPackageDto
  ): Promise<AdmissionPackage> {
    const { data, error } = await this.supabase
      .from('admission_packages')
      .update({ ...dto, updated_at: new Date().toISOString() })
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
    return data as AdmissionPackage;
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

  // ── per-program availability ────────────────────────────────────────────
  static async getProgramEligibility(
    packageId: string
  ): Promise<AdmissionPackageProgramEligibility[]> {
    const { data, error } = await this.supabase
      .from('admission_package_program_eligibility')
      .select('*')
      .eq('package_id', packageId)
      .order('program_id', { ascending: true, nullsFirst: true });
    if (error) {
      logger.error(LOG, 'Database error listing program eligibility', error);
      throw new Error(error.message || 'Failed to fetch package program eligibility');
    }
    return (data ?? []) as AdmissionPackageProgramEligibility[];
  }

  static async addProgramEligibility(
    dto: CreatePackageProgramEligibilityDto
  ): Promise<AdmissionPackageProgramEligibility> {
    const { data, error } = await this.supabase
      .from('admission_package_program_eligibility')
      .insert([{ ...dto, program_id: dto.program_id ?? null }])
      .select()
      .single();
    if (error) {
      logger.error(LOG, 'Database error adding program eligibility', error);
      throw new Error(error.message || 'Failed to add package program eligibility');
    }
    return data as AdmissionPackageProgramEligibility;
  }

  static async removeProgramEligibility(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_package_program_eligibility')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(LOG, 'Database error removing program eligibility', error);
      throw new Error(error.message || 'Failed to remove package program eligibility');
    }
  }

  // ── learner ↔ package assignment ────────────────────────────────────────
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
   * package, the bundled room category, and their separately-chosen mess. The
   * allocation flow consumes this to pre-fill the (eligibility-filtered) room +
   * mess selections. Returns null when the learner has no package for the year.
   */
  static async getPackageForLearner(
    learnerId: string,
    hostelYearId?: string | null
  ): Promise<ResolvedLearnerPackage | null> {
    let query = this.supabase
      .from('learner_package_assignment')
      // embed the bundled room category's name so the allocation hint can show
      // "bundles <category>" without a second round-trip.
      .select('*, pkg:admission_packages(*, room_category:hostel_categories(name))')
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
      pkg: (AdmissionPackage & { room_category?: { name?: string } | null }) | null;
    };
    if (!row.pkg) return null;

    // flatten the embedded category join onto the package's display field
    const pkg: AdmissionPackage = {
      ...row.pkg,
      room_category_name:
        row.pkg.room_category?.name ?? row.pkg.room_category_name ?? null,
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
