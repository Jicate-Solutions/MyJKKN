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
   * Get positions filtered by a specific category
   */
  static async getPositionsByCategory(category: string): Promise<LCPosition[]> {
    const { data, error } = await this.supabase
      .from('lc_positions')
      .select('*')
      .eq('category', category)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[lc/structure] Error fetching positions by category:', error);
      throw new Error(`Failed to fetch positions by category: ${error.message}`);
    }

    return (data || []) as LCPosition[];
  }

  /**
   * Create a new LC position.
   * Category can be 'executive', 'representative', 'portfolio_head', etc. (DB enum).
   */
  static async createPosition(data: {
    title: string;
    category: string;
    tier?: string;
    institution_id?: string;
    description?: string;
    max_holders?: number;
    sort_order?: number;
  }): Promise<LCPosition> {
    const insertPayload = {
      title: data.title,
      category: data.category,
      tier: data.tier || 'jkkn_wide',
      max_holders: data.max_holders ?? 1,
      sort_order: data.sort_order ?? 100,
      is_active: true,
      ...(data.institution_id ? { institution_id: data.institution_id } : {}),
      ...(data.description ? { description: data.description } : {}),
    };

    const { data: position, error } = await this.supabase
      .from('lc_positions')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[lc/structure] Error creating position:', error);
      throw new Error(`Failed to create position: ${error.message}`);
    }

    return position as LCPosition;
  }

  /**
   * Update an LC position.
   */
  static async updatePosition(
    id: string,
    data: Partial<{
      title: string;
      category: string;
      tier: string;
      institution_id: string | null;
      description: string | null;
      max_holders: number;
      sort_order: number;
      is_active: boolean;
    }>
  ): Promise<LCPosition> {
    const { data: position, error } = await this.supabase
      .from('lc_positions')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[lc/structure] Error updating position:', error);
      throw new Error(`Failed to update position: ${error.message}`);
    }

    return position as LCPosition;
  }

  /**
   * Delete a position:
   * - Hard delete if NO members reference it
   * - Soft delete (is_active=false) if members exist
   */
  static async deletePosition(id: string): Promise<void> {
    // Check if any members reference this position
    const { count, error: countError } = await this.supabase
      .from('lc_members')
      .select('*', { count: 'exact', head: true })
      .eq('position_id', id);

    if (countError) {
      console.error('[lc/structure] Error checking position members:', countError);
      throw new Error(`Failed to check position members: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      // Soft delete
      const { error } = await this.supabase
        .from('lc_positions')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('[lc/structure] Error soft-deleting position:', error);
        throw new Error(`Failed to deactivate position: ${error.message}`);
      }
      return;
    }

    // Hard delete
    const { error } = await this.supabase
      .from('lc_positions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[lc/structure] Error deleting position:', error);
      throw new Error(`Failed to delete position: ${error.message}`);
    }
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
   * Get LC members with filters and joined data.
   * institution_id is conditional to support super_admin cross-institution view.
   *
   * The `tier` filter selects LC proper ('tier_1') vs YUVA chapter leadership
   * ('yuva_chapter') — both live in lc_members but are segregated by
   * lc_positions.tier. When tier is provided, the position join becomes an
   * inner join so the tier filter can be pushed into PostgREST.
   */
  static async getMembers(filters: {
    term_id?: string;
    status?: string;
    institution_id?: string;
    tier?: string;
  }): Promise<LCMember[]> {
    const positionJoin = filters.tier
      ? 'position:lc_positions!inner(*)'
      : 'position:lc_positions(*)';

    let query = this.supabase
      .from('lc_members')
      .select(`
        *,
        ${positionJoin},
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
    if (filters.tier) {
      query = query.eq('position.tier', filters.tier);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[lc/structure] Error fetching members:', error);
      throw new Error(`Failed to fetch members: ${error.message}`);
    }

    return (data || []) as LCMember[];
  }

  /**
   * How many people are actively holding a seat, and who they are.
   *
   * A "seat" is one (term, position) pair. Used to refuse an assignment that
   * would give a position more active holders than lc_positions.max_holders
   * allows — see assignMember().
   */
  private static async getSeatOccupancy(termId: string, positionId: string): Promise<{
    title: string;
    maxHolders: number;
    holders: { user_id: string; name: string }[];
  }> {
    // maybeSingle, not single: a position that is missing or invisible must not
    // take the whole feature down. The insert path never needed SELECT rights
    // on lc_positions before this check existed, and .single() would turn a
    // PGRST116 into "Failed to check the position: JSON object requested..."
    // on EVERY assignment. Fall back to a one-holder seat — strictest sane
    // default — and let the unique index remain the real backstop.
    const { data: position, error: positionError } = await this.supabase
      .from('lc_positions')
      .select('title, max_holders')
      .eq('id', positionId)
      .maybeSingle();

    if (positionError) {
      console.warn('[lc/structure] Could not read position for occupancy check:', positionError);
    }

    const { data: sitting, error: sittingError } = await this.supabase
      .from('lc_members')
      .select('user_id, user:profiles(full_name)')
      .eq('term_id', termId)
      .eq('position_id', positionId)
      .eq('status', 'active');

    if (sittingError) {
      console.error('[lc/structure] Error reading current holders:', sittingError);
      throw new Error(`Failed to check the current holders: ${sittingError.message}`);
    }

    return {
      title: position?.title ?? 'This position',
      // max_holders is nullable (DEFAULT 1) and carries no CHECK constraint, so
      // 0 and negatives are storable — the positions UI coerces via
      // `parseInt(x) || 1`, but an import or a direct write does not. Treat
      // unset as a single-holder seat, and floor at 1 so a 0 cannot make every
      // assignment fail with "already has all 0 of its holders ()".
      maxHolders: Math.max(1, position?.max_holders ?? 1),
      holders: (sitting ?? []).map((row) => {
        const r = row as unknown as { user_id: string; user?: { full_name?: string | null } | null };
        return { user_id: r.user_id, name: r.user?.full_name?.trim() || 'someone already on the council' };
      })
    };
  }

  /**
   * Assign a member to a position for a given term.
   *
   * Refuses to give a seat more active holders than the position allows. This
   * has to be checked explicitly: the only relevant database constraint,
   * lc_members_unique_position (term_id, position_id, user_id), has user_id in
   * the key, so a DIFFERENT learner assigned to an already-filled seat has a
   * distinct key and inserts cleanly. Without this check the council silently
   * ends up with two active Presidents and the screens show only one.
   *
   * The intended order of work is unaffected: retire the outgoing officer
   * (status -> inactive/graduated/removed) and the seat frees immediately,
   * because only 'active' rows count as holders.
   */
  static async assignMember(data: {
    term_id: string;
    position_id: string;
    user_id: string;
    institution_id: string;
    appointment_notes?: string;
  }): Promise<LCMember> {
    const seat = await this.getSeatOccupancy(data.term_id, data.position_id);

    if (seat.holders.length >= seat.maxHolders) {
      const alreadyThisPerson = seat.holders.some((h) => h.user_id === data.user_id);
      const names = seat.holders.map((h) => h.name).join(', ');

      if (alreadyThisPerson) {
        // Name only the duplicate. Interpolating the full holder list here
        // would read "A, B already holds President" on a multi-holder seat —
        // naming people who are not the duplicate, with a singular verb.
        const duplicate = seat.holders.find((h) => h.user_id === data.user_id);
        throw new Error(`${duplicate?.name ?? 'This learner'} already holds ${seat.title} for this term.`);
      }
      if (seat.maxHolders === 1) {
        throw new Error(
          `${seat.title} is already held by ${names}. End their term first, then assign the new holder.`
        );
      }
      throw new Error(
        `${seat.title} already has all ${seat.maxHolders} of its holders (${names}). ` +
          `End one of their terms first, then assign the new holder.`
      );
    }

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
      // The occupancy check above reads through RLS. lc_members' SELECT policy
      // is USING (true) for authenticated today, so it sees every holder and
      // wins the race in practice — but if that policy is ever narrowed, or two
      // assignments land at once, the database index refuses the insert
      // instead. Translate that raw constraint violation into the same plain
      // English rather than leaking "duplicate key value violates ...".
      if (error.code === '23505') {
        if (error.message.includes('lc_members_one_active_holder_per_seat')) {
          // Deliberately does not promise what max_holders says: the index
          // enforces exactly one active holder regardless of how the position
          // is configured, so a seat set to 2 holders is refused here even
          // though the check above allowed it. Say what actually happened.
          throw new Error(
            `${seat.title} already has an active holder for this term — a seat can hold only one active person at a time. End their term first, then assign the new holder.`
          );
        }
        if (error.message.includes('lc_members_unique_position')) {
          throw new Error(`This learner has already been assigned to ${seat.title} for this term.`);
        }
      }
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

    // ...and clear it when coming back, or a reinstated holder is active while
    // still carrying the timestamp of the day they left. Any report that reads
    // `ended_at IS NOT NULL` as "retired" would then contradict `status`.
    if (status === 'active') {
      updateData.ended_at = null;
    }

    // Bringing someone BACK to active is the other way a seat can end up with
    // two holders: reinstating a retired officer, or returning an on_leave
    // holder while a stand-in is sitting active. Same rule as assignMember --
    // refuse with the sitting holder's name rather than letting the unique
    // index answer with a raw constraint violation.
    let seatForMessage: { title: string } | null = null;
    if (status === 'active') {
      const { data: current, error: currentError } = await this.supabase
        .from('lc_members')
        .select('term_id, position_id, status')
        .eq('id', id)
        .single();

      if (currentError) {
        console.error('[lc/structure] Error reading member before reactivation:', currentError);
        throw new Error(`Failed to read this member: ${currentError.message}`);
      }

      const row = current as unknown as { term_id: string; position_id: string; status: string | null };
      if (row.status !== 'active') {
        const seat = await this.getSeatOccupancy(row.term_id, row.position_id);
        seatForMessage = { title: seat.title };
        if (seat.holders.length >= seat.maxHolders) {
          const names = seat.holders.map((h) => h.name).join(', ');
          throw new Error(
            `${seat.title} is already held by ${names}. End their term first, then set this member back to Active.`
          );
        }
      }
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
      if (error.code === '23505' && error.message.includes('lc_members_one_active_holder_per_seat')) {
        const title = seatForMessage?.title ?? 'That position';
        throw new Error(
          `${title} already has an active holder for this term — a seat can hold only one active person at a time. End their term first, then set this member back to Active.`
        );
      }
      throw new Error(`Failed to update member status: ${error.message}`);
    }

    // Close position history when member becomes inactive/graduated/removed
    if (['inactive', 'graduated', 'removed'].includes(status) && member) {
      try {
        const m = member as unknown as { user_id: string; position_id: string; term_id: string };
        await this.supabase
          .from('lc_position_history')
          .update({
            ended_at: new Date().toISOString(),
            end_reason: status
          })
          .eq('user_id', m.user_id)
          .eq('position_id', m.position_id)
          .eq('term_id', m.term_id)
          .is('ended_at', null);
      } catch (historyErr) {
        console.warn('[lc/structure] Failed to close position history:', historyErr);
      }
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
   * Get YUVA chapters with optional filters.
   * institution_id is conditional to support super_admin cross-institution view.
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

    // Fetch verticals for this specific chapter
    const { data: verticalMembers } = await this.supabase
      .from('yuva_vertical_members')
      .select(`
        vertical_id,
        vertical:yuva_verticals(*)
      `)
      .eq('chapter_id', id)
      .eq('is_active', true);

    // Deduplicate verticals (multiple members per vertical)
    const verticalMap = new Map<string, YUVAVertical>();
    interface VerticalMemberRow { vertical_id: string; vertical?: YUVAVertical | null }
    for (const vm of (verticalMembers || []) as unknown as VerticalMemberRow[]) {
      if (vm.vertical && !verticalMap.has(vm.vertical.id)) {
        verticalMap.set(vm.vertical.id, vm.vertical);
      }
    }

    // Also fetch all active verticals as reference (for assigning new ones)
    const { data: allVerticals } = await this.supabase
      .from('yuva_verticals')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const chapter = data as unknown as YUVAChapter;
    chapter.verticals = (allVerticals || []) as YUVAVertical[];

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

  /**
   * Update an existing YUVA chapter
   */
  static async updateChapter(
    chapterId: string,
    data: { name?: string; description?: string; academic_year?: string; is_active?: boolean }
  ): Promise<YUVAChapter> {
    const { data: chapter, error } = await this.supabase
      .from('yuva_chapters')
      .update(data)
      .eq('id', chapterId)
      .select(`
        *,
        institution:institutions(id, name)
      `)
      .single();

    if (error) {
      console.error('[lc/structure] Error updating chapter:', error);
      throw new Error(`Failed to update chapter: ${error.message}`);
    }

    return chapter as YUVAChapter;
  }

  /**
   * Get a single term by ID with full details
   */
  static async getTermById(termId: string): Promise<LCTerm> {
    const { data, error } = await this.supabase
      .from('lc_terms')
      .select('*')
      .eq('id', termId)
      .single();

    if (error) {
      console.error('[lc/structure] Error fetching term by id:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Term not found');
      }
      throw new Error(`Failed to fetch term: ${error.message}`);
    }

    return data as LCTerm;
  }

  /**
   * Handover workflow: deactivate old term members and transition to new term
   */
  static async handoverWorkflow(oldTermId: string, newTermId: string): Promise<void> {
    // 1. Deactivate all active members of the old term
    const { error: membersError } = await this.supabase
      .from('lc_members')
      .update({
        status: 'inactive' as LCMemberStatus,
        ended_at: new Date().toISOString()
      })
      .eq('term_id', oldTermId)
      .eq('status', 'active');

    if (membersError) {
      console.error('[lc/structure] Error deactivating old term members:', membersError);
      throw new Error(`Failed to deactivate old term members: ${membersError.message}`);
    }

    // 2. Close position history records for old term
    const { error: historyError } = await this.supabase
      .from('lc_position_history')
      .update({
        ended_at: new Date().toISOString(),
        end_reason: 'term_handover'
      })
      .eq('term_id', oldTermId)
      .is('ended_at', null);

    if (historyError) {
      console.error('[lc/structure] Error closing position history:', historyError);
      throw new Error(`Failed to close position history: ${historyError.message}`);
    }

    // 3. Mark old term as completed
    const { error: oldTermError } = await this.supabase
      .from('lc_terms')
      .update({ status: 'completed' as TermStatus })
      .eq('id', oldTermId);

    if (oldTermError) {
      console.error('[lc/structure] Error completing old term:', oldTermError);
      throw new Error(`Failed to complete old term: ${oldTermError.message}`);
    }

    // 4. Activate new term
    const { error: newTermError } = await this.supabase
      .from('lc_terms')
      .update({ status: 'active' as TermStatus })
      .eq('id', newTermId);

    if (newTermError) {
      console.error('[lc/structure] Error activating new term:', newTermError);
      throw new Error(`Failed to activate new term: ${newTermError.message}`);
    }
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

  /**
   * Soft-delete a vertical by setting is_active=false
   */
  static async deleteVertical(verticalId: string): Promise<void> {
    const { error } = await this.supabase
      .from('yuva_verticals')
      .update({ is_active: false })
      .eq('id', verticalId);

    if (error) {
      console.error('[lc/structure] Error deleting vertical:', error);
      throw new Error(`Failed to delete vertical: ${error.message}`);
    }

    // Also deactivate all members of this vertical
    await this.supabase
      .from('yuva_vertical_members')
      .update({
        is_active: false,
        ended_at: new Date().toISOString()
      })
      .eq('vertical_id', verticalId)
      .eq('is_active', true);
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

    return (data || []) as unknown as YUVAVerticalMember[];
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

    return member as unknown as YUVAVerticalMember;
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

  // ============================================================================
  // PROGRESSION TRACKING
  // ============================================================================

  /**
   * Get a user's progression path: YUVA roles + LC position history
   */
  static async getProgressionTracking(userId: string): Promise<{
    lc_history: LCPositionHistory[];
    yuva_history: YUVAVerticalMember[];
  }> {
    // Fetch LC position history
    const { data: lcHistory, error: lcError } = await this.supabase
      .from('lc_position_history')
      .select(`
        *,
        position:lc_positions(id, title, category, tier),
        term:lc_terms(id, name, start_date, end_date, status)
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    if (lcError) {
      console.error('[lc/structure] Error fetching LC history:', lcError);
      throw new Error(`Failed to fetch LC history: ${lcError.message}`);
    }

    // Fetch YUVA vertical member history (including inactive)
    const { data: yuvaHistory, error: yuvaError } = await this.supabase
      .from('yuva_vertical_members')
      .select(`
        *,
        chapter:yuva_chapters(id, name, institution_id),
        vertical:yuva_verticals(id, name, type)
      `)
      .eq('user_id', userId)
      .order('appointed_at', { ascending: false });

    if (yuvaError) {
      console.error('[lc/structure] Error fetching YUVA history:', yuvaError);
      throw new Error(`Failed to fetch YUVA history: ${yuvaError.message}`);
    }

    return {
      lc_history: (lcHistory || []) as LCPositionHistory[],
      yuva_history: (yuvaHistory || []) as YUVAVerticalMember[]
    };
  }
}
