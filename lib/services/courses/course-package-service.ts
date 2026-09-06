import { BaseService } from '@/lib/services/base-service';
import type {
  CoursePackage,
  CoursePackageInstallment,
  SaveCoursePackageDto,
  SaveCoursePackageResult,
} from '@/types/courses';

/** Left join, not `!inner` — a package with no schedule yet is a legitimate
 *  draft, and `!inner` would silently drop exactly those rows. */
const SELECT = `
  *,
  installments:course_package_installments(*)
`;

export class CoursePackageService extends BaseService {
  /**
   * PostgREST serialises Postgres `numeric` as a STRING ("62500.00"), while the
   * generated Row type claims `number`. Nothing in the type system catches that,
   * and "0.00" is truthy, so an unconverted amount fails as `"62500.00" + "62500.00"
   * = "62500.0062500.00"` rather than as an error. Every money column crosses this
   * one function on the way in; downstream code can treat them as real numbers.
   *
   * The schedule is sorted here rather than with PostgREST's `referencedTable`
   * ordering — the rows are already being mapped for the Number() pass, and
   * sorting in the same place keeps the order independent of whether the embed
   * is addressed by its alias or its table name.
   */
  private static normalise(row: any): CoursePackage {
    const installments: CoursePackageInstallment[] = (row?.installments ?? [])
      .map((i: any) => ({ ...i, amount: Number(i.amount) }))
      .sort(
        (a: CoursePackageInstallment, b: CoursePackageInstallment) =>
          a.installment_no - b.installment_no,
      );

    return { ...row, total_amount: Number(row.total_amount), installments };
  }

  /** Ordinary table read — RLS (courses.view + role_has_institution_access)
   *  gates the rows, so there is no institution filter to pass here. */
  static async listByCourse(courseEventId: string) {
    const { data, error } = await this.supabase
      .from('course_packages')
      .select(SELECT)
      .eq('course_event_id', courseEventId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => this.normalise(row));
  }

  static async getById(id: string) {
    const { data, error } = await this.supabase
      .from('course_packages')
      .select(SELECT)
      .eq('id', id)
      .single();

    if (error) throw error;
    return this.normalise(data);
  }

  /**
   * The ONLY write path for a package. Never split this into a table update plus
   * an installment write: fn_course_package_amounts_chk is DEFERRABLE INITIALLY
   * DEFERRED on both tables and fires at COMMIT, and PostgREST gives each request
   * its own transaction — so a reprice done in two calls trips 23514 whichever
   * half goes first. See the migration header.
   *
   * Every optional key is resolved to an explicit `null` rather than left
   * undefined. `JSON.stringify` drops undefined-valued keys entirely, so an
   * undefined seat_cap would vanish from the jsonb and the RPC would read it as
   * "not provided" instead of "cleared". This is the same layer interaction that
   * bit Phase 2a, where it dropped a key from a PATCH and the column silently
   * never updated.
   *
   * The RPC is absent from the generated Database['public']['Functions'] type
   * (types/supabase.ts has not been regenerated since the migration), so the
   * client is cast — the house pattern, see campus-living/allocation-audit-service.
   */
  static async save(dto: SaveCoursePackageDto): Promise<SaveCoursePackageResult> {
    const p = dto.package;

    const p_package = {
      id: p.id ?? null,
      course_event_id: p.course_event_id,
      name: p.name,
      description: p.description ?? null,
      total_amount: p.total_amount,
      currency: p.currency ?? 'INR',
      seat_cap: p.seat_cap ?? null,
      sale_opens_at: p.sale_opens_at ?? null,
      sale_closes_at: p.sale_closes_at ?? null,
      is_active: p.is_active ?? true,
      display_order: p.display_order ?? 0,
    };

    const p_installments = dto.installments.map((i) => ({
      label: i.label ?? null,
      amount: i.amount,
      due_date: i.due_date,
    }));

    const { data, error } = await (this.supabase as any).rpc('fn_save_course_package', {
      p_package,
      p_installments,
    });

    if (error) throw error;
    return data as SaveCoursePackageResult;
  }

  /**
   * Installments cascade (ON DELETE CASCADE), so only the package is deleted.
   *
   * The `.select('id')` is not decoration: under RLS a blocked DELETE removes
   * ZERO ROWS SILENTLY and returns no error, so without reading back what was
   * deleted this would report success for a denial. The manage policy is FOR ALL,
   * so anyone permitted to delete can also read the returned row.
   *
   * A package with enrollments is blocked by its FK; surface that error rather
   * than swallowing it.
   */
  static async remove(id: string) {
    const { data, error } = await this.supabase
      .from('course_packages')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'The package was not deleted — it no longer exists, or you lack permission to delete it.',
      );
    }
  }
}
