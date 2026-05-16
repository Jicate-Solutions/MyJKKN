import { createClient } from '@/lib/supabase/server';

export async function getSyllabi(filters: {
  search?: string;
  boardId?: string;
  regulationId?: string;
  stream?: string;
  page?: number;
  limit?: number;
} = {}) {
  const supabase = await createClient();
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from('bos_course_syllabi').select('*', { count: 'exact' });

  if (filters.search) {
    query = query.or(`course_code.ilike.%${filters.search}%,course_name.ilike.%${filters.search}%`);
  }
  if (filters.boardId) {
    query = query.eq('board_id', filters.boardId);
  }
  if (filters.regulationId) {
    query = query.eq('regulation_id', filters.regulationId);
  }
  if (filters.stream) {
    query = query.eq('stream', filters.stream);
  }

  const { data, count, error } = await query
    .order('course_code', { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to fetch syllabi: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize: limit,
  };
}
