// lib/services/courses/public-course-loader.ts
//
// The ONE place the public projection of a course is defined.
//
// SERVER ONLY. This module builds a service-role Supabase client, which bypasses
// RLS completely — it must never be imported from a 'use client' file. Phase 1
// revoked anon on every course table (verified: a bare anon read returns 42501),
// so RLS is not the gate on the public surface. These functions are.
//
// That makes the column projection here the actual security boundary rather than
// a nicety. Every returned field is listed by hand and the return types are the
// Public* shapes, which carry no institution_id, no created_by and no id the
// page does not need — so an accidental leak is a type error, not something a
// reviewer has to spot.
//
// Shared by the public pages (server components, direct call) and the public API
// routes (for the client-side apply widget), so the projection cannot drift
// between the two.

import { createClient } from '@supabase/supabase-js';
import { isWindowOpen } from '@/lib/services/courses/application-window';
import type {
  CourseEventMode,
  CourseFieldType,
  PublicCourseApplyForm,
  PublicCoursePackage,
  PublicCourseSummary,
  PublicFormSection,
} from '@/types/courses';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** PostgREST serialises numeric as a STRING; "250000.00" is truthy and
 *  concatenates instead of adding. Convert at the boundary, once. */
const money = (v: unknown) => Number(v ?? 0);

function toPublicPackages(rows: any[], now: Date): PublicCoursePackage[] {
  return rows
    // A package outside its OWN sale window is not on sale, even while the
    // course's application window is open. Filtered rather than greyed out — a
    // tier nobody can buy is noise on a landing page.
    .filter((p) => isWindowOpen(p.sale_opens_at, p.sale_closes_at, now))
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      total_amount: money(p.total_amount),
      currency: p.currency,
      seat_cap: p.seat_cap ?? null,
      installments: ((p.installments ?? []) as any[])
        .slice()
        .sort((a, b) => a.installment_no - b.installment_no)
        .map((i) => ({
          label: i.label ?? null,
          amount: money(i.amount),
          due_date: i.due_date,
        })),
    }));
}

const PACKAGE_COLUMNS =
  'id, name, description, total_amount, currency, seat_cap, display_order, sale_opens_at, sale_closes_at, ' +
  'installments:course_package_installments(label, amount, due_date, installment_no)';

/**
 * The public view of one course. Returns null for an unknown slug AND for a
 * course that is not `published` — publishing is what makes a course readable by
 * URL, so a slug guess must not expose one still being prepared.
 */
export async function loadPublicCourse(slug: string): Promise<PublicCourseSummary | null> {
  if (!slug) return null;
  const supabase = serviceClient();

  const { data: course, error } = await supabase
    .from('course_events')
    .select(
      'id, title, slug, description, mode, start_date, end_date, venue_text, cover_image_url, application_opens_at, application_closes_at',
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('[public-course-loader] course load failed:', error.message);
    return null;
  }
  if (!course) return null;

  const c = course as any;

  const [{ data: packages }, { data: forms }] = await Promise.all([
    supabase
      .from('course_packages')
      .select(PACKAGE_COLUMNS)
      .eq('course_event_id', c.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('course_registration_forms')
      .select('name, slug, description, display_order')
      .eq('course_event_id', c.id)
      .eq('is_enabled', true)
      .order('display_order', { ascending: true }),
  ]);

  const now = new Date();
  const enabledForms = forms ?? [];
  const activePackages = packages ?? [];
  const onSalePackages = toPublicPackages(activePackages, now);

  return {
    title: c.title,
    slug: c.slug,
    description: c.description ?? null,
    mode: c.mode as CourseEventMode,
    start_date: c.start_date ?? null,
    end_date: c.end_date ?? null,
    venue_text: c.venue_text ?? null,
    cover_image_url: c.cover_image_url ?? null,
    application_opens_at: c.application_opens_at ?? null,
    application_closes_at: c.application_closes_at ?? null,
    // Open means the window allows it AND there is something to fill in. A
    // course with an open window and no enabled form cannot be applied to, and
    // saying "open" there sends people to a dead end.
    //
    // The same reasoning extends to PACKAGES, which it originally did not. A
    // course that defines fees but has no tier on sale cannot price an
    // application, and course_enrollments.package_id is NOT NULL — so such an
    // application can never become an enrollment. It used to be accepted
    // silently: the chooser simply vanished and package_id landed NULL.
    applicationsOpen:
      isWindowOpen(c.application_opens_at, c.application_closes_at, now) &&
      enabledForms.length > 0 &&
      (activePackages.length === 0 || onSalePackages.length > 0),
    packages: onSalePackages,
    packagesExist: activePackages.length > 0,
    forms: enabledForms.map((f: any) => ({
      name: f.name,
      slug: f.slug,
      description: f.description ?? null,
    })),
  };
}

/**
 * One enabled form, rendered as an apply page. `formSlug` may be omitted, in
 * which case the course's single enabled form is used — but only when there is
 * exactly one, because silently picking the first of several would send an
 * applicant down a path they did not choose.
 */
export async function loadPublicApplyForm(
  courseSlug: string,
  formSlug?: string,
): Promise<PublicCourseApplyForm | null> {
  if (!courseSlug) return null;
  const supabase = serviceClient();

  const { data: course } = await supabase
    .from('course_events')
    .select('id, title, slug, application_opens_at, application_closes_at')
    .eq('slug', courseSlug)
    .eq('status', 'published')
    .maybeSingle();

  if (!course) return null;
  const c = course as any;

  let query = supabase
    .from('course_registration_forms')
    .select('id, name, slug, description')
    .eq('course_event_id', c.id)
    .eq('is_enabled', true);

  if (formSlug) query = query.eq('slug', formSlug);

  const { data: forms } = await query;
  const candidates = (forms ?? []) as any[];

  // No form named, and more than one enabled: the caller must choose.
  if (candidates.length !== 1) return null;
  const form = candidates[0];

  const [{ data: sections }, { data: fields }, { data: packages }] = await Promise.all([
    supabase
      .from('course_registration_form_sections')
      .select('id, title, description, display_order')
      .eq('form_id', form.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('course_registration_form_fields')
      // BY form_id, never by course_event_id. Filtering fields by the course is
      // exactly the bug the Events builder shipped: with a second form on the
      // same course, every form rendered every other form's fields.
      .select('field_key, label, field_type, is_required, options, placeholder, help_text, section_id, display_order')
      .eq('form_id', form.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('course_packages')
      .select(PACKAGE_COLUMNS)
      .eq('course_event_id', c.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  const allFields = (fields ?? []) as any[];

  const publicSections: PublicFormSection[] = ((sections ?? []) as any[]).map((s) => ({
    title: s.title,
    description: s.description ?? null,
    fields: allFields
      .filter((f) => f.section_id === s.id)
      .map((f) => ({
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type as CourseFieldType,
        is_required: f.is_required,
        options: Array.isArray(f.options) ? (f.options as string[]) : [],
        placeholder: f.placeholder ?? null,
        help_text: f.help_text ?? null,
      })),
  }));

  // Fields with no section still have to render, or a question the admin wrote
  // would silently never be asked. The builder always assigns one, but the
  // column is nullable and this module is not the only possible writer.
  const orphans = allFields.filter((f) => !f.section_id);
  if (orphans.length > 0) {
    publicSections.push({
      title: 'Additional details',
      description: null,
      fields: orphans.map((f) => ({
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type as CourseFieldType,
        is_required: f.is_required,
        options: Array.isArray(f.options) ? (f.options as string[]) : [],
        placeholder: f.placeholder ?? null,
        help_text: f.help_text ?? null,
      })),
    });
  }

  const activePackages = (packages ?? []) as any[];
  const onSalePackages = toPublicPackages(activePackages, new Date());

  return {
    courseTitle: c.title,
    courseSlug: c.slug,
    formName: form.name,
    formSlug: form.slug,
    formDescription: form.description ?? null,
    // Deliberately NOT ANDed with the package check here. The widget needs to
    // tell "the window is shut" apart from "the fees are not on sale" to say
    // anything useful, so it gets both facts and decides. Collapsing them would
    // put an applicant back in front of a message that does not explain itself.
    applicationsOpen: isWindowOpen(c.application_opens_at, c.application_closes_at),
    sections: publicSections,
    packages: onSalePackages,
    packagesExist: activePackages.length > 0,
  };
}
