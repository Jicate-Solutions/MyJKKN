// CDC Industry Mentor Service — agent ζ Sprint 7b

import { createClient } from '@/lib/supabase/server';
import type {
  IndustryMentor,
  CreateIndustryMentorInput,
  UpdateIndustryMentorInput,
  IndustryMentorListParams,
  IndustryMentorListResponse,
} from '@/types/cdc/industry-mentors';

/**
 * The directory already holds an active mentor with this email for this
 * institution. BUG-005760: the same mentor was saved twice 0.7 s apart (one
 * double submit) and a third row shared the email under another spelling of
 * the name; nothing on the server refused a repeat.
 */
export class DuplicateIndustryMentorError extends Error {
  constructor(public readonly existingId: string) {
    super(
      'This mentor is already in the directory: an active mentor with the same email exists for this institution. Open that entry instead of adding it again.'
    );
    this.name = 'DuplicateIndustryMentorError';
  }
}

/**
 * The caller can read this mentor but the database refused the change
 * (BUG-005292). The row-level rule on industry_mentors lets only the person
 * who added the mentor, or an admin / institution admin, update it; the
 * refusal used to surface as "JSON object requested, multiple (or no) rows
 * returned". Who may edit is a policy decision — this only names it.
 */
export class IndustryMentorEditRefusedError extends Error {
  constructor() {
    super(
      'Your account can view this mentor but is not allowed to change it. Only the person who added the mentor, or an administrator, can edit it — ask one of them, or ask for edit rights.'
    );
    this.name = 'IndustryMentorEditRefusedError';
  }
}

function normaliseEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

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

  // Refuse a repeat of an active mentor (same institution, same email). Read
  // and compared in code rather than with .ilike(): PostgREST treats `*` in an
  // ilike pattern as a wildcard that cannot be escaped.
  const email = normaliseEmail(input.email);
  if (email) {
    const { data: sameInstitution, error: dupError } = await (supabase as any)
      .from('industry_mentors')
      .select('id, email')
      .eq('institution_id', input.institution_id)
      .eq('is_active', true);
    if (dupError) throw new Error(dupError.message);
    const existing = ((sameInstitution ?? []) as { id: string; email: string | null }[]).find(
      (row) => normaliseEmail(row.email) === email
    );
    if (existing) throw new DuplicateIndustryMentorError(existing.id);
  }

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

  if (error) {
    // Zero rows updated. If the caller can still read the row, the row-level
    // rule refused the write; if not, the mentor is gone (or out of reach).
    if (error.code === 'PGRST116') {
      const { data: visible } = await (supabase as any)
        .from('industry_mentors')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (visible) throw new IndustryMentorEditRefusedError();
      throw new Error('Mentor not found');
    }
    throw new Error(error.message);
  }

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
