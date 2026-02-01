import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NPSSurvey, SurveyFilters, SurveyListResponse } from '@/types/stakeholder-nps';

export async function getSurveys(filters: SurveyFilters = {}): Promise<SurveyListResponse> {
  const supabase = await createServerSupabaseClient();

  const {
    institution_id,
    stakeholder_type,
    status,
    department_id,
    program_id,
    search,
    start_date_from,
    start_date_to,
    page = 1,
    limit = 10,
    sortBy = 'created_at',
    sortDirection = 'desc'
  } = filters;

  let query = supabase
    .from('nps_surveys')
    .select(`
      *,
      department:departments(id, department_name),
      program:programs(id, program_name),
      creator:users_profiles!nps_surveys_created_by_fkey(id, full_name, email)
    `, { count: 'exact' });

  // Apply filters
  if (institution_id) {
    query = query.eq('institution_id', institution_id);
  }
  if (stakeholder_type) {
    query = query.eq('stakeholder_type', stakeholder_type);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (department_id) {
    query = query.eq('department_id', department_id);
  }
  if (program_id) {
    query = query.eq('program_id', program_id);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }
  if (start_date_from) {
    query = query.gte('start_date', start_date_from);
  }
  if (start_date_to) {
    query = query.lte('start_date', start_date_to);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortDirection === 'asc' });

  // Apply pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('[stakeholder-nps] Error fetching surveys:', error);
    throw new Error(`Failed to fetch surveys: ${error.message}`);
  }

  return {
    data: (data || []) as NPSSurvey[],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  };
}

export async function getSurvey(id: string): Promise<NPSSurvey | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('nps_surveys')
    .select(`
      *,
      department:departments(id, department_name),
      program:programs(id, program_name),
      creator:users_profiles!nps_surveys_created_by_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[stakeholder-nps] Error fetching survey:', error);
    throw new Error(`Failed to fetch survey: ${error.message}`);
  }

  return data as NPSSurvey;
}
