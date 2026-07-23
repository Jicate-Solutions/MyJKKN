// lib/services/cdc/club-initiatives-service.ts
// Service layer for CDC Club Initiatives (BUG-004299).
// Mirrors ClubService: static methods that take the RLS-scoped browser client.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcClubInitiative,
  CreateClubInitiativeDto,
  UpdateClubInitiativeDto,
} from '@/types/cdc/clubs-initiatives';

export class ClubInitiativesService {
  static async list(supabase: SupabaseClient, clubId: string): Promise<CdcClubInitiative[]> {
    const { data, error } = await supabase
      .from('cdc_club_initiatives')
      .select('*')
      .eq('club_id', clubId)
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as CdcClubInitiative[];
  }

  static async create(supabase: SupabaseClient, dto: CreateClubInitiativeDto): Promise<CdcClubInitiative> {
    const { data, error } = await supabase
      .from('cdc_club_initiatives')
      .insert({
        club_id: dto.club_id,
        institution_id: dto.institution_id ?? null,
        title: dto.title,
        status: dto.status ?? 'planned',
        start_date: dto.start_date ?? null,
        notes: dto.notes ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CdcClubInitiative;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateClubInitiativeDto,
  ): Promise<CdcClubInitiative> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.title !== undefined) payload.title = dto.title;
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.start_date !== undefined) payload.start_date = dto.start_date;
    if (dto.notes !== undefined) payload.notes = dto.notes;

    const { data, error } = await supabase
      .from('cdc_club_initiatives')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as CdcClubInitiative;
  }

  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('cdc_club_initiatives')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}
