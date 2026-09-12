// lib/services/bos/syllabus-lookup.ts
//
// Resolve bos_course_syllabi rows for the API-key surface
// (app/api/api-management/academic/syllabus/*). Pure helpers are kept free of
// Next/Supabase so they unit-test without mocks.
//
// Lookup keys:
//   course_id    — stable COE courses.id (preferred; CAS-safe, rename-safe)
//   course_code  — snapshot text; NOT unique (CAS Self/Aided, R-2021 vs R-2026,
//                  versions) so it REQUIRES institution_id.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BosCourseSyllabus } from '@/types/bos';
import { supportedFormats, type SyllabusPdfFormat } from '@/lib/utils/bos/syllabus-pdf-html';

const SYLLABI_TABLE = 'bos_course_syllabi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);

export interface SyllabusLookupQuery {
  courseId?: string;
  courseCode?: string;
  institutionId?: string;
  regulationId?: string;
  version?: number;
  includeArchived: boolean;
}

export type LookupParseResult =
  | { ok: true; query: SyllabusLookupQuery }
  | { ok: false; message: string };

/** Validate the shared query string of the metadata + one-shot PDF routes. */
export function parseSyllabusLookupQuery(params: URLSearchParams): LookupParseResult {
  const courseId = params.get('course_id')?.trim() || undefined;
  const courseCode = params.get('course_code')?.trim() || undefined;
  const institutionId = params.get('institution_id')?.trim() || undefined;
  const regulationId = params.get('regulation_id')?.trim() || undefined;
  const versionRaw = params.get('version');
  const includeArchived = params.get('include_archived') === 'true';

  if (!courseId && !courseCode) {
    return { ok: false, message: 'Provide course_id (COE course uuid) or course_code with institution_id' };
  }
  if (courseId && !isUuid(courseId)) return { ok: false, message: 'course_id must be a uuid' };
  if (courseCode && !courseId && !institutionId) {
    return { ok: false, message: 'course_code lookup requires institution_id (the same code exists across institutions and regulations)' };
  }
  if (institutionId && !isUuid(institutionId)) return { ok: false, message: 'institution_id must be a uuid' };
  if (regulationId && !isUuid(regulationId)) return { ok: false, message: 'regulation_id must be a uuid' };

  let version: number | undefined;
  if (versionRaw !== null && versionRaw !== '') {
    version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 1) return { ok: false, message: 'version must be a positive integer' };
  }

  return { ok: true, query: { courseId, courseCode, institutionId, regulationId, version, includeArchived } };
}

/** Service-role read. Latest non-archived unless `version` / `includeArchived` say otherwise. */
export async function findSyllabi(
  db: SupabaseClient,
  q: SyllabusLookupQuery,
): Promise<BosCourseSyllabus[]> {
  let query = db.from(SYLLABI_TABLE).select('*');

  if (q.courseId) query = query.eq('course_id', q.courseId);
  else if (q.courseCode) query = query.ilike('course_code', q.courseCode);
  if (q.institutionId) query = query.eq('institutions_id', q.institutionId);
  if (q.regulationId) query = query.eq('regulation_id', q.regulationId);
  if (q.version !== undefined) query = query.eq('version_number', q.version);
  else query = query.eq('is_latest', true);
  if (!q.includeArchived) query = query.eq('is_archived', false);

  const { data, error } = await query
    .order('is_latest', { ascending: false })
    .order('last_modified_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BosCourseSyllabus[];
}

export async function findSyllabusById(
  db: SupabaseClient,
  id: string,
  includeArchived: boolean,
): Promise<BosCourseSyllabus | null> {
  let query = db.from(SYLLABI_TABLE).select('*').eq('id', id);
  if (!includeArchived) query = query.eq('is_archived', false);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as BosCourseSyllabus | null) ?? null;
}

/**
 * Institution-bound keys (api_keys with an institution) may only read their
 * own rows. Super keys (institutionId null) read everything.
 */
export function keyMayRead(keyInstitutionId: string | null, row: Pick<BosCourseSyllabus, 'institutions_id'>): boolean {
  return keyInstitutionId === null || keyInstitutionId === row.institutions_id;
}

/** Wire shape of one syllabus in the metadata endpoint. */
export interface SyllabusApiMeta {
  id: string;
  course_id: string | null;
  course_code: string;
  course_name: string;
  institution_id: string;
  board_id: string;
  regulation_id: string | null;
  academic_model: string;
  stream: string | null;
  course_credits: number | null;
  version_number: number;
  is_latest: boolean;
  is_archived: boolean;
  last_modified_at: string | null;
  formats: SyllabusPdfFormat[];
  pdf_path: string;
  /** Reserved for the signed-URL phase; always null today. */
  pdf_url: null;
}

export const SYLLABUS_API_BASE = '/api/api-management/academic/syllabus';

export function toSyllabusApiMeta(s: BosCourseSyllabus): SyllabusApiMeta {
  return {
    id: s.id,
    course_id: s.course_id ?? null,
    course_code: s.course_code,
    course_name: s.course_name,
    institution_id: s.institutions_id,
    board_id: s.board_id,
    regulation_id: s.regulation_id ?? null,
    academic_model: s.academic_model ?? 'anna_univ',
    stream: s.stream ?? null,
    course_credits: s.course_credits ?? null,
    version_number: s.version_number,
    is_latest: s.is_latest,
    is_archived: s.is_archived,
    last_modified_at: s.last_modified_at ?? null,
    formats: supportedFormats(s),
    pdf_path: `${SYLLABUS_API_BASE}/${s.id}/pdf?format=official`,
    pdf_url: null,
  };
}

/** Strong ETag: any content change bumps last_modified_at; version/format make it unique per document. */
export function syllabusEtag(s: Pick<BosCourseSyllabus, 'id' | 'version_number' | 'last_modified_at'>, format: SyllabusPdfFormat): string {
  return `"${s.id}:${s.version_number}:${format}:${s.last_modified_at ?? ''}"`;
}

export function syllabusPdfFilename(courseCode: string, format: SyllabusPdfFormat, version: number): string {
  const safe = courseCode.replace(/[^A-Za-z0-9._-]+/g, '_');
  return `${safe}-syllabus-${format}-v${version}.pdf`;
}
