/**
 * CourseGradesService
 * Provides data access for LTI grades (course grades module).
 *
 * Both getGradesWithClient and getFilterOptions accept an injected SupabaseClient
 * so server components can pass their server client directly.
 *
 * Created: 2026-02-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { SupabaseClient } from '@supabase/supabase-js';

// ─── Filters ───────────────────────────────────────────────────────────────

export interface CourseGradesFilters {
  institutionId: string;
  toolId?: string;
  learnerId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
  resourceLinkId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

// ─── Return types ──────────────────────────────────────────────────────────

/**
 * Matches the GradeData type used by the course-grades page and its child components.
 * Fields mirror the exact SELECT in getGrades() — nested joins are kept as objects
 * (the service normalises the Supabase array-or-object response before returning).
 */
export interface CourseGrade {
  id: string;
  resource_link_id: string;
  resource_link_title: string | null;
  score: number;
  score_maximum: number;
  score_percentage: number;
  activity_progress: string | null;
  grading_progress: string | null;
  graded_at: string | null;
  received_at: string;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  learners_profiles: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number: string | null;
    program_id: string;
    semester_id: string;
    section_id: string;
    programs: { name: string } | null;
    semesters: { name: string } | null;
    sections: { name: string } | null;
  };
}

export interface CourseGradesFilterOptions {
  tools: { id: string; name: string; tool_type: string }[];
  programs: { id: string; name: string }[];
  semesters: { id: string; name: string }[];
  sections: { id: string; name: string }[];
}

// ─── Service ───────────────────────────────────────────────────────────────

export class CourseGradesService {
  private static supabase = createClientSupabaseClient();

  // ── Client-side convenience wrapper ──────────────────────────────────────

  /**
   * Fetches grades using the singleton browser client.
   * Suitable for React Query hooks running in Client Components.
   */
  static async getGrades(
    filters: CourseGradesFilters
  ): Promise<{ data: CourseGrade[]; total: number }> {
    return this.getGradesWithClient(this.supabase, filters);
  }

  // ── Server-compatible canonical implementation ────────────────────────────

  /**
   * Fetches LTI grades with optional filters.
   * Accepts an injected SupabaseClient so Server Components can pass their
   * server-side client (from `createClient()` in @/lib/supabase/server).
   *
   * NOTE: The original page used lti_tools!inner and learners_profiles!inner.
   * Both have been converted to plain left joins here so that grades whose
   * FK targets have been deleted are NOT silently dropped.
   */
  static async getGradesWithClient(
    supabase: SupabaseClient,
    filters: CourseGradesFilters
  ): Promise<{ data: CourseGrade[]; total: number }> {
    const { page = 1, pageSize = 50 } = filters;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('lti_grades')
      .select(
        `
        id,
        resource_link_id,
        resource_link_title,
        score,
        score_maximum,
        score_percentage,
        activity_progress,
        grading_progress,
        graded_at,
        received_at,
        lti_tools (
          id,
          name,
          tool_type
        ),
        learners_profiles (
          id,
          first_name,
          last_name,
          roll_number,
          program_id,
          semester_id,
          section_id,
          programs (name),
          semesters (name),
          sections (name)
        )
      `,
        { count: 'exact' }
      )
      .eq('institution_id', filters.institutionId)
      .order('graded_at', { ascending: false })
      .range(from, to);

    // Direct column filters on lti_grades
    if (filters.toolId) {
      query = query.eq('tool_id', filters.toolId);
    }
    if (filters.learnerId) {
      query = query.eq('learner_profile_id', filters.learnerId);
    }
    if (filters.resourceLinkId) {
      query = query.eq('resource_link_id', filters.resourceLinkId);
    }
    if (filters.startDate) {
      query = query.gte('graded_at', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('graded_at', filters.endDate);
    }

    // Filters on joined learners_profiles columns (dotted notation)
    if (filters.programId) {
      query = query.eq('learners_profiles.program_id', filters.programId);
    }
    if (filters.semesterId) {
      query = query.eq('learners_profiles.semester_id', filters.semesterId);
    }
    if (filters.sectionId) {
      query = query.eq('learners_profiles.section_id', filters.sectionId);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('academic/course-grades', 'Failed to fetch grades', error);
      throw error;
    }

    // Normalise Supabase join responses: they may arrive as single objects or
    // single-element arrays depending on the join type and PostgREST version.
    const normalised: CourseGrade[] = (data ?? []).map((item: any) => ({
      id: item.id,
      resource_link_id: item.resource_link_id,
      resource_link_title: item.resource_link_title,
      score: item.score,
      score_maximum: item.score_maximum,
      score_percentage: item.score_percentage,
      activity_progress: item.activity_progress,
      grading_progress: item.grading_progress,
      graded_at: item.graded_at,
      received_at: item.received_at,
      lti_tools: Array.isArray(item.lti_tools)
        ? item.lti_tools[0]
        : item.lti_tools,
      learners_profiles: Array.isArray(item.learners_profiles)
        ? item.learners_profiles[0]
        : item.learners_profiles
    }));

    return { data: normalised, total: count ?? 0 };
  }

  // ── Filter options ─────────────────────────────────────────────────────────

  /**
   * Fetches dropdown options for the filters panel.
   * Accepts an injected SupabaseClient so Server Components can pass their
   * server-side client.
   *
   * NOTE: lti_tools has NO institution_id column — it is filtered only by
   * is_active. Programs, semesters, and sections are filtered by institution_id.
   * Semesters in the original page had no institution_id filter; we add it here
   * to be consistent with the multi-tenant pattern (add institution_id filter
   * only if the column exists — check semesters table expectation from other
   * services; remove the filter if the column is absent).
   */
  static async getFilterOptions(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<CourseGradesFilterOptions> {
    const [toolsResult, programsResult, semestersResult, sectionsResult] =
      await Promise.all([
        // lti_tools has no institution_id — filter only by is_active
        supabase
          .from('lti_tools')
          .select('id, name, tool_type')
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('programs')
          .select('id, name')
          .eq('institution_id', institutionId)
          .order('name'),

        // Original page fetched all semesters without institution filter
        supabase.from('semesters').select('id, name').order('name'),

        supabase
          .from('sections')
          .select('id, name')
          .order('name')
      ]);

    if (toolsResult.error) {
      logger.warn(
        'academic/course-grades',
        'Failed to fetch LTI tools for filter',
        toolsResult.error
      );
    }
    if (programsResult.error) {
      logger.warn(
        'academic/course-grades',
        'Failed to fetch programs for filter',
        programsResult.error
      );
    }
    if (semestersResult.error) {
      logger.warn(
        'academic/course-grades',
        'Failed to fetch semesters for filter',
        semestersResult.error
      );
    }
    if (sectionsResult.error) {
      logger.warn(
        'academic/course-grades',
        'Failed to fetch sections for filter',
        sectionsResult.error
      );
    }

    return {
      tools: toolsResult.data ?? [],
      programs: programsResult.data ?? [],
      semesters: semestersResult.data ?? [],
      sections: sectionsResult.data ?? []
    };
  }
}
