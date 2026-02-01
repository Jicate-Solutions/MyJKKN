/**
 * Server-side data fetching for Maturity Assessments
 */

import { createClient } from '@/lib/supabase/server';
import type {
  MaturityAssessment,
  MaturityAssessmentFilters
} from '@/types/maturity-assessment';

interface GetAssessmentsResult {
  data: MaturityAssessment[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function getAssessments(
  filters: MaturityAssessmentFilters = {}
): Promise<GetAssessmentsResult> {
  const supabase = await createClient();

  let query = supabase
    .from('maturity_assessments')
    .select(
      `
      *,
      department:departments(id, name),
      assessor:users_profiles!assessor_id(id, full_name, email),
      reviewer:users_profiles!reviewed_by(id, full_name, email),
      framework:maturity_frameworks(id, name),
      institution:institutions(id, name, counselling_code)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }
  if (filters.department_id) {
    query = query.eq('department_id', filters.department_id);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.assessor_id) {
    query = query.eq('assessor_id', filters.assessor_id);
  }
  if (filters.date_from) {
    query = query.gte('assessment_date', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('assessment_date', filters.date_to);
  }

  // Apply sorting
  const sortBy = filters.sortBy || 'assessment_date';
  const sortDirection = filters.sortDirection || 'desc';
  query = query.order(sortBy, { ascending: sortDirection === 'asc' });

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('[getAssessments] Error:', error);
    throw new Error(`Failed to fetch assessments: ${error.message}`);
  }

  return {
    data: (data as MaturityAssessment[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  };
}

export async function getAssessmentById(
  id: string
): Promise<MaturityAssessment | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('maturity_assessments')
    .select(
      `
      *,
      department:departments(id, name),
      assessor:users_profiles!assessor_id(id, full_name, email),
      reviewer:users_profiles!reviewed_by(id, full_name, email),
      framework:maturity_frameworks(*),
      institution:institutions(id, name, counselling_code),
      progress_items:maturity_progress(*)
    `
    )
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[getAssessmentById] Error:', error);
    throw new Error(`Failed to fetch assessment: ${error.message}`);
  }

  return data as MaturityAssessment | null;
}
