import { BaseService } from '@/lib/services/base-service';
import type {
  CourseForm,
  CourseFormField,
  CourseFormSection,
  SaveCourseFormDto,
  SaveCourseFormResult,
} from '@/types/courses';

/**
 * Sections carry their own fields via the SECTION link, and the embed names its
 * constraint explicitly. `course_registration_form_fields` has two FKs —
 * `form_id` to forms and `section_id` to sections — so leaving the relationship
 * to inference is exactly the ambiguity Phase 2c hit (`PGRST201`) between
 * `course_sessions` and `resource_reservations`. Name it and it cannot happen.
 *
 * Left joins: a form with no sections yet is the normal state of a draft, and
 * `!inner` would drop precisely those.
 */
const SELECT = `
  *,
  sections:course_registration_form_sections(
    *,
    fields:course_registration_form_fields!course_registration_form_fields_section_id_fkey(*)
  )
`;

export class CourseFormService extends BaseService {
  /**
   * Sorting happens here rather than through PostgREST's `referencedTable`
   * ordering — the rows are already being walked to attach `field_count`, and
   * doing it in one place keeps the order independent of whether the embed is
   * addressed by its alias or its table name.
   *
   * `field_count` is derived from the sections rather than a separate query.
   * fn_save_course_registration_form is the ONLY writer and it always attaches a
   * field to a section, so a field with `section_id IS NULL` cannot originate
   * from this module.
   */
  private static normalise(row: any): CourseForm {
    const sections: CourseFormSection[] = (row?.sections ?? [])
      .map((s: any) => ({
        ...s,
        fields: ((s.fields ?? []) as CourseFormField[])
          .slice()
          .sort((a, b) => a.display_order - b.display_order),
      }))
      .sort((a: CourseFormSection, b: CourseFormSection) => a.display_order - b.display_order);

    const field_count = sections.reduce((n, s) => n + (s.fields?.length ?? 0), 0);
    return { ...row, sections, field_count };
  }

  /** Ordinary table read — RLS (courses.view + role_has_institution_access)
   *  gates the rows, so there is no institution filter here. */
  static async listByCourse(courseEventId: string) {
    const { data, error } = await this.supabase
      .from('course_registration_forms')
      .select(SELECT)
      .eq('course_event_id', courseEventId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => this.normalise(row));
  }

  static async getById(id: string) {
    const { data, error } = await this.supabase
      .from('course_registration_forms').select(SELECT).eq('id', id).single();
    if (error) throw error;
    return this.normalise(data);
  }

  /**
   * The ONLY write path for a form's structure. Never split this into a form
   * update plus section/field writes: a failure between deleting the old
   * structure and inserting the new one leaves a live PUBLIC form collecting
   * nothing, and the form stays reachable the whole time.
   *
   * Every optional key is resolved to an explicit value rather than left
   * undefined — `JSON.stringify` drops undefined-valued keys, so an undefined
   * `description` would vanish from the jsonb and the RPC would read it as "not
   * provided" instead of "cleared". Same layer interaction that bit Phase 2a.
   *
   * The RPC is absent from the generated Functions type (types/supabase.ts has
   * not been regenerated), so the client is cast — the house pattern.
   */
  static async save(dto: SaveCourseFormDto): Promise<SaveCourseFormResult> {
    const f = dto.form;

    const p_form = {
      id: f.id ?? null,
      course_event_id: f.course_event_id,
      name: f.name,
      slug: f.slug,
      description: f.description ?? null,
      display_order: f.display_order ?? 0,
      is_enabled: f.is_enabled ?? false,
    };

    const p_sections = dto.sections.map((s) => ({
      title: s.title,
      description: s.description ?? null,
      fields: s.fields.map((x) => ({
        field_key: x.field_key,
        label: x.label,
        field_type: x.field_type,
        is_required: x.is_required ?? false,
        options: x.options ?? [],
        placeholder: x.placeholder ?? null,
        help_text: x.help_text ?? null,
        validation: x.validation ?? {},
      })),
    }));

    const { data, error } = await (this.supabase as any).rpc(
      'fn_save_course_registration_form',
      { p_form, p_sections },
    );

    if (error) throw error;
    return data as SaveCourseFormResult;
  }

  /**
   * The switch that opens or closes public intake. Separate from save() so the
   * panel can flip it without round-tripping the whole structure — and so the
   * hook can say plainly what just happened.
   *
   * Read-back guard: under RLS a blocked UPDATE changes zero rows and returns NO
   * error, so without this an admin who lacks the permission would be told the
   * form is live when it is not.
   */
  static async setEnabled(id: string, enabled: boolean) {
    const { data, error } = await this.supabase
      .from('course_registration_forms')
      .update({ is_enabled: enabled } as any)
      .eq('id', id)
      .select('id, is_enabled');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'The form was not changed — it no longer exists, or you lack permission to change it.',
      );
    }
    return data[0] as { id: string; is_enabled: boolean };
  }

  /** Sections and fields cascade. The read-back is the same silent-denial guard
   *  as everywhere else in this module. */
  static async remove(id: string) {
    const { data, error } = await this.supabase
      .from('course_registration_forms').delete().eq('id', id).select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'The form was not deleted — it no longer exists, or you lack permission to delete it.',
      );
    }
  }

  /** UNIQUE (course_event_id, slug). Checked before submit so a duplicate is a
   *  field message rather than a raw 23505 — mirrors CourseEventService. */
  static async slugAvailable(courseEventId: string, slug: string, excludeId?: string) {
    let q = this.supabase
      .from('course_registration_forms').select('id')
      .eq('course_event_id', courseEventId).eq('slug', slug);
    if (excludeId) q = q.neq('id', excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return !data;
  }
}
