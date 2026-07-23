// lib/services/cdc/club-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcClub,
  CdcClubWithMemberCount,
  CdcClubMembershipWithLearner,
  CreateClubDto,
  UpdateClubDto,
  AddMemberDto,
  ClubFilters,
  ClubListResponse,
} from '@/types/cdc/clubs';

export class ClubService {
  static async list(supabase: SupabaseClient, filters: ClubFilters = {}): Promise<ClubListResponse> {
    const { page = 1, limit = 20, institution_id, is_active, status, club_type } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('cdc_clubs')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (institution_id) query = query.eq('institution_id', institution_id);
    // `status` is the canonical 3-state filter; when present it takes precedence
    // over the legacy is_active boolean filter.
    if (status) query = query.eq('status', status);
    else if (is_active !== undefined) query = query.eq('is_active', is_active);
    if (club_type) query = query.eq('club_type', club_type);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    // Fetch member counts in one extra query
    const clubs = (data ?? []) as CdcClub[];
    const ids = clubs.map(c => c.id);
    let memberCounts: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: memberships } = await supabase
        .from('cdc_club_memberships')
        .select('club_id')
        .in('club_id', ids)
        .eq('is_active', true);

      for (const m of memberships ?? []) {
        memberCounts[m.club_id] = (memberCounts[m.club_id] ?? 0) + 1;
      }
    }

    const enriched: CdcClubWithMemberCount[] = clubs.map(c => ({
      ...c,
      member_count: memberCounts[c.id] ?? 0,
    }));

    return { data: enriched, total: count ?? 0, page, limit };
  }

  static async getById(supabase: SupabaseClient, id: string): Promise<CdcClubWithMemberCount> {
    const { data, error } = await supabase
      .from('cdc_clubs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from('cdc_club_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('club_id', id)
      .eq('is_active', true);

    return { ...(data as CdcClub), member_count: count ?? 0 };
  }

  static async create(supabase: SupabaseClient, dto: CreateClubDto): Promise<CdcClub> {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Default to 'active' when no status supplied. Keep legacy is_active in sync
    // so the existing "Active only" toggle + "Inactive" badge keep working.
    const status = dto.status ?? 'active';

    const { data, error } = await supabase
      .from('cdc_clubs')
      .insert({
        name: dto.name,
        slug,
        description: dto.description ?? null,
        club_type: dto.club_type ?? null,
        coordinator_staff_id: dto.coordinator_staff_id ?? null,
        student_president_id: dto.student_president_id ?? null,
        institution_id: dto.institution_id ?? null,
        formed_on: dto.formed_on ?? null,
        status,
        is_active: status === 'active',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcClub;
  }

  static async update(supabase: SupabaseClient, id: string, dto: UpdateClubDto): Promise<CdcClub> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.club_type !== undefined) payload.club_type = dto.club_type;
    if (dto.coordinator_staff_id !== undefined) payload.coordinator_staff_id = dto.coordinator_staff_id;
    if (dto.student_president_id !== undefined) payload.student_president_id = dto.student_president_id;
    if (dto.institution_id !== undefined) payload.institution_id = dto.institution_id;
    if (dto.formed_on !== undefined) payload.formed_on = dto.formed_on;
    if (dto.updated_by !== undefined) payload.updated_by = dto.updated_by;
    // When status changes, keep the legacy is_active boolean in sync.
    if (dto.status !== undefined) {
      payload.status = dto.status;
      payload.is_active = dto.status === 'active';
    } else if (dto.is_active !== undefined) {
      payload.is_active = dto.is_active;
    }

    const { data, error } = await supabase
      .from('cdc_clubs')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcClub;
  }

  // Members
  static async listMembers(supabase: SupabaseClient, clubId: string): Promise<CdcClubMembershipWithLearner[]> {
    const { data, error } = await supabase
      .from('cdc_club_memberships')
      .select(`*, learner:learner_id(id, name, roll_number, institution_id)`)
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('joined_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as CdcClubMembershipWithLearner[];
  }

  static async addMember(supabase: SupabaseClient, clubId: string, dto: AddMemberDto): Promise<void> {
    const { error } = await supabase
      .from('cdc_club_memberships')
      .insert({
        club_id: clubId,
        learner_id: dto.learner_id,
        role: dto.role ?? 'member',
        notes: dto.notes ?? null,
        is_active: true,
      });

    if (error) throw new Error(error.message);
  }

  static async removeMember(supabase: SupabaseClient, clubId: string, learnerId: string): Promise<void> {
    const { error } = await supabase
      .from('cdc_club_memberships')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('club_id', clubId)
      .eq('learner_id', learnerId)
      .eq('is_active', true);

    if (error) throw new Error(error.message);
  }
}
