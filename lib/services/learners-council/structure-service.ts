// lib/services/learners-council/structure-service.ts
// LC-001: Learners Council Structure Management - Service Layer

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LCTerm,
  LCPosition,
  LCMember,
  LCPositionHistory,
  YUVAChapter,
  YUVAVertical,
  YUVAVerticalMember,
  CreateLCTermDto,
  UpdateLCTermDto,
  CreateYUVAVerticalDto,
  UpdateYUVAVerticalDto,
  TermStatus,
  LCMemberStatus
} from '@/types/learners-council';

export class LCStructureService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // TERM METHODS
  // ============================================================================

  /**
   * Get all terms ordered by start_date descending
   */
  static async getTerms(): Promise<LCTerm[]> {
    const { data, error } = await this.supabase
      .from('lc_terms')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) {
      console.error('[lc/structure] Error fetching terms:', error);
      throw new Error(`Failed to fetch terms: ${error.message}`);
    }

    return (data || []) as LCTerm[];
  }

  /**
   * Get the current active term
   */
  static async getActiveTerm(): Promise<LCTerm | null> {
    const { data, error } = await this.supabase
      .from('lc_terms')
      .select('*')
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('[lc/structure] Error fetching active term:', error);
      throw new Error(`Failed to fetch active term: ${error.message}`);
    }

    return data as LCTerm | null;
  }

  /**
   * Create a new term
   */
  static async createTerm(data: CreateLCTermDto, userId: string): Promise<LCTerm> {
    const { data: term, error } = await this.supabase
      .from('lc_terms')
      .insert({
        ...data,
        status: 'upcoming' as TermStatus,
        created_by: userId
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/structure] Error creating term:', error);
      throw new Error(`Failed to create term: ${error.message}`);
    }

    return term as LCTerm;
  }

  /**
   * Update an existing term
   */
  static async updateTerm(id: string, data: UpdateLCTermDto): Promise<LCTerm> {
    const { data: term, error } = await this.supabase
      .from('lc_terms')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/structure] Error updating term:', error);
      throw new Error(`Failed to update term: ${error.message}`);
    }

    return term as LCTerm;
  }

  // ============================================================================
  // POSITION METHODS
  // ============================================================================

  /**
   * Get positions with optional filters
   */
  static async getPositions(filters?: {
    tier?: string;
    category?: string;
    is_active?: boolean;
  }): Promise<LCPosition[]> {
    let query = this.supabase
      .from('lc_positions')
      .select('*')
      .order('sort_order', { ascending: true });

    if (filters?.tier) {
      query = query.eq('tier', filters.tier);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/structure] Error fetching positions:', error);
      throw new Error(`Failed to fetch positions: ${error.message}`);
    }

    return (data || []) as LCPosition[];
  }

  /**
   * Get all holders of a specific position across terms
   */
  static async getPositionHistory(positionId: string): Promise<LCPositionHistory[]> {
    const { data, error } = await this.supabase
      .from('lc_position_history')
      .select(`
        *,
        position:lc_positions(id, title, category, tier),
        user:profiles(id, full_name),
        term:lc_terms(id, name, start_date, end_date, status)
      `)
      .eq('position_id', positionId)
      .order('started_at', { ascending: false });

    if (error) {
      console.error('[lc/structure] Error fetching position history:', error);
      throw new Error(`Failed to fetch position history: ${error.message}`);
    }

    return (data || []) as LCPositionHistory[];
  }

  // ============================================================================
  // MEMBER METHODS
  // ============================================================================

  /**
   * Get LC members with filters and joined data
   */
  static async getMembers(filters: {
    term_id?: string;
    status?: string;
    institution_id?: string;
  }): Promise<LCMember[]> {
    let query = this.supabase
      .from('lc_members')
      .select(`
        *,
        position:lc_positions(*),
        user:profiles(id, full_name, email, avatar_url),
        term:lc_terms(id, name, status)
      `)
      .order('appointed_at', { ascending: false });

    if (filters.term_id) {
      query = query.eq('term_id', filters.term_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/structure] Error fetching members:', error);
      throw new Error(`Failed to fetch members: ${error.message}`);
    }

    return (data || []) as LCMember[];
  }

  /**
   * Assign a member to a position for a given term
   */
  static async assignMember(data: {
    term_id: string;
    position_id: string;
    user_id: string;
    institution_id: string;
    appointment_notes?: string;
  }): Promise<LCMember> {
    const { data: member, error } = await this.supabase
      .from('lc_members')
      .insert({
        ...data,
        status: 'active' as LCMemberStatus,
        appointed_at: new Date().toISOString()
      })
      .select(`
        *,
        position:lc_positions(*),
        user:profiles(id, full_name, email, avatar_url),
        term:lc_terms(id, name, status)
      `)
      .single();

    if (error) {
      console.error('[lc/structure] Error assigning member:', error);
      throw new Error(`Failed to assign member: ${error.message}`);
    }

    // Also log to position history
    await this.supabase.from('lc_position_history').insert({
      position_id: data.position_id,
      user_id: data.user_id,
      term_id: data.term_id,
      started_at: new Date().toISOString()
    });

    return member as LCMember;
  }

  /**
   * Update a member's status
   */
  static async updateMemberStatus(id: string, status: string): Promise<LCMember> {
    const updateData: Record<string, unknown> = { status };

    // If being removed/graduated, set ended_at
    if (['inactive', 'graduated', 'removed'].includes(status)) {
      updateData.ended_at = new Date().toISOString();
    }

    const { data: member, error } = await this.supabase
      .from('lc_members')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        position:lc_positions(*),
        user:profiles(id, full_name, email, avatar_url),
        term:lc_terms(id, name, status)
      `)
      .single();

    if (error) {
      console.error('[lc/structure] Error updating member status:', error);
      throw new Error(`Failed to update member status: ${error.message}`);
    }

    return member as LCMember;
  }

  /**
   * Get a single member by ID with all joins
   */
  static async getMemberById(id: string): Promise<LCMember> {
    const { data, error } = await this.supabase
      .from('lc_members')
      .select(`
        *,
        position:lc_positions(*),
        user:profiles(id, full_name, email, avatar_url),
        term:lc_terms(id, name, status)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/structure] Error fetching member:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Member not found');
      }
      throw new Error(`Failed to fetch member: ${error.message}`);
    }

    return data as LCMember;
  }

  // ============================================================================
  // YUVA CHAPTER METHODS
  // ============================================================================

  /**
   * Get YUVA chapters with optional filters
   */
  static async getChapters(filters?: {
    institution_id?: string;
    is_active?: boolean;
  }): Promise<YUVAChapter[]> {
    let query = this.supabase
      .from('yuva_chapters')
      .select(`
        *,
        institution:institutions(id, name)
      `)
      .order('name', { ascending: true });

    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/structure] Error fetching chapters:', error);
      throw new Error(`Failed to fetch chapters: ${error.message}`);
    }

    return (data || []) as YUVAChapter[];
  }

  /**
   * Get a single chapter by ID with verticals and members
   */
  static async getChapterById(id: string): Promise<YUVAChapter> {
    const { data, error } = await this.supabase
      .from('yuva_chapters')
      .select(`
        *,
        institution:institutions(id, name),
        members:yuva_vertical_members(
          *,
          user:profiles(id, full_name, email, avatar_url),
          vertical:yuva_verticals(id, name, type)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[lc/structure] Error fetching chapter:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Chapter not found');
      }
      throw new Error(`Failed to fetch chapter: ${error.message}`);
    }

    // Also fetch verticals separately (cleaner than deeply nested join)
    const { data: verticals } = await this.supabase
      .from('yuva_verticals')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const chapter = data as YUVAChapter;
    chapter.verticals = (verticals || []) as YUVAVertical[];

    return chapter;
  }

  /**
   * Create a new YUVA chapter
   */
  static async createChapter(data: {
    institution_id: string;
    name: string;
    description?: string;
    academic_year: string;
  }): Promise<YUVAChapter> {
    const { data: chapter, error } = await this.supabase
      .from('yuva_chapters')
      .insert({
        ...data,
        is_active: true
      })
      .select(`
        *,
        institution:institutions(id, name)
      `)
      .single();

    if (error) {
      console.error('[lc/structure] Error creating chapter:', error);
      throw new Error(`Failed to create chapter: ${error.message}`);
    }

    return chapter as YUVAChapter;
  }

  // ============================================================================
  // YUVA VERTICAL METHODS
  // ============================================================================

  /**
   * Get YUVA verticals with optional filters
   */
  static async getVerticals(filters?: {
    type?: string;
    is_active?: boolean;
  }): Promise<YUVAVertical[]> {
    let query = this.supabase
      .from('yuva_verticals')
      .select('*')
      .order('sort_order', { ascending: true });

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/structure] Error fetching verticals:', error);
      throw new Error(`Failed to fetch verticals: ${error.message}`);
    }

    return (data || []) as YUVAVertical[];
  }

  /**
   * Create a new YUVA vertical
   */
  static async createVertical(data: CreateYUVAVerticalDto): Promise<YUVAVertical> {
    const { data: vertical, error } = await this.supabase
      .from('yuva_verticals')
      .insert({
        ...data,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[lc/structure] Error creating vertical:', error);
      throw new Error(`Failed to create vertical: ${error.message}`);
    }

    return vertical as YUVAVertical;
  }

  /**
   * Update a YUVA vertical
   */
  static async updateVertical(id: string, data: UpdateYUVAVerticalDto): Promise<YUVAVertical> {
    const { data: vertical, error } = await this.supabase
      .from('yuva_verticals')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/structure] Error updating vertical:', error);
      throw new Error(`Failed to update vertical: ${error.message}`);
    }

    return vertical as YUVAVertical;
  }

  // ============================================================================
  // YUVA VERTICAL MEMBER METHODS
  // ============================================================================

  /**
   * Get all vertical members for a chapter
   */
  static async getVerticalMembers(chapterId: string): Promise<YUVAVerticalMember[]> {
    const { data, error } = await this.supabase
      .from('yuva_vertical_members')
      .select(`
        *,
        user:profiles(id, full_name, email, avatar_url),
        vertical:yuva_verticals(id, name, type)
      `)
      .eq('chapter_id', chapterId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[lc/structure] Error fetching vertical members:', error);
      throw new Error(`Failed to fetch vertical members: ${error.message}`);
    }

    return (data || []) as YUVAVerticalMember[];
  }

  /**
   * Assign a member to a vertical within a chapter
   */
  static async assignVerticalMember(data: {
    chapter_id: string;
    vertical_id: string;
    user_id: string;
    role: string;
    academic_year: string;
  }): Promise<YUVAVerticalMember> {
    const { data: member, error } = await this.supabase
      .from('yuva_vertical_members')
      .insert({
        ...data,
        is_active: true,
        appointed_at: new Date().toISOString()
      })
      .select(`
        *,
        user:profiles(id, full_name, email, avatar_url),
        vertical:yuva_verticals(id, name, type)
      `)
      .single();

    if (error) {
      console.error('[lc/structure] Error assigning vertical member:', error);
      throw new Error(`Failed to assign vertical member: ${error.message}`);
    }

    return member as YUVAVerticalMember;
  }

  /**
   * Remove a vertical member (soft-remove: set is_active=false)
   */
  static async removeVerticalMember(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('yuva_vertical_members')
      .update({
        is_active: false,
        ended_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('[lc/structure] Error removing vertical member:', error);
      throw new Error(`Failed to remove vertical member: ${error.message}`);
    }
  }
}
