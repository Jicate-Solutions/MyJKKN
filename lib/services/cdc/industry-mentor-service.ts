// CDC Industry Mentor Service — agent ζ Sprint 7b

import { createClient } from '@/lib/supabase/server';
import type {
  IndustryMentor,
  CreateIndustryMentorInput,
  UpdateIndustryMentorInput,
  IndustryMentorListParams,
  IndustryMentorListResponse,
} from '@/types/cdc/industry-mentors';

export async function listIndustryMentors(
  params: IndustryMentorListParams = {}
): Promise<IndustryMentorListResponse> {
  const supabase = await createClient();
  const { sector, status = 'active', page = 1, limit = 20, search } = params;

  let query = (supabase as any)
    .from('industry_mentors')
    .select('*', { count: 'exact' });

  if (status === 'active') query = query.eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);

  if (sector) {
    query = query.contains('expertise_areas', [sector]);
  }

  if (search) {
    query = query.or(
      `mentor_name.ilike.%${search}%,company_name.ilike.%${search}%,designation.ilike.%${search}%`
    );
  }

  const offset = (page - 1) * limit;
  query = query
    .order('mentor_name', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    mentors: (data ?? []) as IndustryMentor[],
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getIndustryMentor(
  id: string
): Promise<IndustryMentor | null> {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('industry_mentors')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }

  return data as IndustryMentor;
}

export async function createIndustryMentor(
  input: CreateIndustryMentorInput
): Promise<IndustryMentor> {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  const created_by = user?.user?.id ?? null;

  const { data, error } = await (supabase as any)
    .from('industry_mentors')
    .insert({ ...input, created_by, is_active: input.is_active ?? true })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as IndustryMentor;
}

export async function updateIndustryMentor(
  id: string,
  input: UpdateIndustryMentorInput
): Promise<IndustryMentor> {
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('industry_mentors')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as IndustryMentor;
}

export async function deleteIndustryMentor(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from('industry_mentors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
