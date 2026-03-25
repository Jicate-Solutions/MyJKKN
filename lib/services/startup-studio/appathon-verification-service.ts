// lib/services/startup-studio/appathon-verification-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  AppathonVerification,
  CreateVerificationDto,
  UpdateVerificationDto,
  EvaluatorTeamCard,
  EvaluatorProgress,
  VerificationScore,
  VerifiedLeaderboardEntry,
} from '@/types/startup-studio'

export class AppathonVerificationService {
  // ─── Score Calculation (matches DB logic — call server-side too) ──────────
  static calculateScore(params: {
    app_live: boolean
    verified_users: number
    verified_active_users: number
    verified_revenue: number
  }): VerificationScore {
    const { app_live, verified_users, verified_active_users, verified_revenue } = params

    // Tier: highest achieved (not cumulative). Active users take priority.
    let tier = 0
    if (verified_active_users >= 25) tier = 4
    else if (verified_active_users >= 10) tier = 3
    else if (verified_users >= 5) tier = 2
    else if (app_live) tier = 1

    const tierPointsMap: Record<number, number> = { 0: 0, 1: 10, 2: 25, 3: 40, 4: 50 }
    const tier_points = tierPointsMap[tier] ?? 0

    // Revenue bonus (separate from tier — any verified revenue counts)
    let revenue_bonus = 0
    if (verified_revenue >= 100) revenue_bonus = 10
    else if (verified_revenue >= 1) revenue_bonus = 5

    return { tier, tier_points, revenue_bonus, total_score: tier_points + revenue_bonus }
  }

  // ─── Evaluator: Get Teams Queue ──────────────────────────────────────────
  /**
   * Returns all teams in the evaluator's demo day venue, with their verification status.
   * Sorted by demo slot order (presentation order).
   */
  static async getEvaluatorTeams(
    eventId: string,
    evaluatorProfileId: string
  ): Promise<EvaluatorTeamCard[]> {
    const supabase = createClientSupabaseClient() as any

    // 1. Find evaluator's venue assignments for this event (demo day, judge roles)
    const { data: staffAssignments, error: staffErr } = await supabase
      .from('event_staff_assignments')
      .select('venue_assignment_id, staff!inner(profile_id)')
      .eq('event_id', eventId)
      .eq('day_type', 'demo_day')
      .in('role', ['judge', 'panel_chair', 'evaluator'])
      .eq('staff.profile_id', evaluatorProfileId)

    if (staffErr) throw staffErr
    if (!staffAssignments?.length) return []

    const venueIds = staffAssignments.map(sa => sa.venue_assignment_id)

    // 2. Get teams allocated to those venues for demo day
    const { data: allocations, error: allocErr } = await supabase
      .from('event_team_venue_allocations')
      .select(`
        registration_id,
        venue_assignment_id,
        event_registrations!inner(
          id,
          team_name,
          institution_id,
          institutions!inner(name),
          event_submissions(
            id, app_name, live_app_url, github_url,
            user_count, active_users_count, mrr_amount, proof_urls
          )
        )
      `)
      .in('venue_assignment_id', venueIds)
      .eq('day_type', 'demo_day')

    if (allocErr) throw allocErr

    // 3. Get this evaluator's existing verifications
    const submissionIds = (allocations ?? [])
      .flatMap(a => {
        const reg = a.event_registrations as any
        return (reg?.event_submissions ?? []).map((s: any) => s.id)
      })
      .filter(Boolean)

    const verificationMap = new Map<string, any>()
    if (submissionIds.length > 0) {
      const { data: verifications } = await supabase
        .from('appathon_verifications')
        .select('*')
        .in('submission_id', submissionIds)
        .eq('evaluator_id', evaluatorProfileId)

      ;(verifications ?? []).forEach(v => verificationMap.set(v.submission_id, v))
    }

    // 4. Get demo slots (for presentation order)
    const { data: demoSlots } = await supabase
      .from('event_demo_slots')
      .select('registration_id, slot_order')
      .eq('event_id', eventId)
      .in('venue_assignment_id', venueIds)

    const slotMap = new Map(
      (demoSlots ?? []).map(s => [s.registration_id, s.slot_order])
    )

    // 5. Build EvaluatorTeamCard[]
    return (allocations ?? [])
      .map(a => {
        const reg = a.event_registrations as any
        const submission = reg?.event_submissions?.[0] ?? null
        return {
          registration_id: a.registration_id,
          team_name: reg?.team_name ?? '',
          institution_name: reg?.institutions?.name ?? '',
          demo_slot: (slotMap.get(a.registration_id) as number | undefined) ?? null,
          venue_id: a.venue_assignment_id,
          submission: submission
            ? {
                id: submission.id,
                app_name: submission.app_name,
                live_app_url: submission.live_app_url,
                github_url: submission.github_url,
                user_count: submission.user_count ?? 0,
                active_users_count: submission.active_users_count ?? 0,
                mrr_amount: Number(submission.mrr_amount ?? 0),
                proof_urls: submission.proof_urls ?? [],
              }
            : null,
          verification: submission
            ? (verificationMap.get(submission.id) ?? null)
            : null,
        } satisfies EvaluatorTeamCard
      })
      .sort((a, b) => (a.demo_slot ?? 999) - (b.demo_slot ?? 999))
  }

  // ─── Super Admin: Get Teams for a Specific Venue ─────────────────────────
  /**
   * Returns all teams in a specific venue for super_admin bypassing staff assignment lookup.
   * Identical to getEvaluatorTeams except venue comes from the caller, not event_staff_assignments.
   */
  static async getTeamsForVenue(
    eventId: string,
    venueId: string,
    evaluatorProfileId: string
  ): Promise<EvaluatorTeamCard[]> {
    const supabase = createClientSupabaseClient() as any

    // 1. Get teams allocated to the given venue for demo day
    const { data: allocations, error: allocErr } = await supabase
      .from('event_team_venue_allocations')
      .select(`
        registration_id,
        venue_assignment_id,
        event_registrations!inner(
          id,
          team_name,
          institution_id,
          institutions!inner(name),
          event_submissions(
            id, app_name, live_app_url, github_url,
            user_count, active_users_count, mrr_amount, proof_urls
          )
        )
      `)
      .eq('venue_assignment_id', venueId)
      .eq('day_type', 'demo_day')

    if (allocErr) throw allocErr

    // 2. Get ALL evaluators' verifications for this venue (super_admin sees everyone's work)
    const submissionIds = (allocations ?? [])
      .flatMap(a => {
        const reg = a.event_registrations as any
        return (reg?.event_submissions ?? []).map((s: any) => s.id)
      })
      .filter(Boolean)

    const verificationMap = new Map<string, any>()
    if (submissionIds.length > 0) {
      const { data: verifications } = await supabase
        .from('appathon_verifications')
        .select('*, profiles!evaluator_id(full_name)')
        .in('submission_id', submissionIds)
        .eq('venue_id', venueId)
        .order('updated_at', { ascending: false })

      // Pick the most recently updated verification per submission
      ;(verifications ?? []).forEach(v => {
        if (!verificationMap.has(v.submission_id)) {
          verificationMap.set(v.submission_id, v)
        }
      })
    }

    // 3. Get demo slots (for presentation order)
    const { data: demoSlots } = await supabase
      .from('event_demo_slots')
      .select('registration_id, slot_order')
      .eq('event_id', eventId)
      .eq('venue_assignment_id', venueId)

    const slotMap = new Map(
      (demoSlots ?? []).map(s => [s.registration_id, s.slot_order])
    )

    // 4. Build EvaluatorTeamCard[]
    return (allocations ?? [])
      .map(a => {
        const reg = a.event_registrations as any
        const submission = reg?.event_submissions?.[0] ?? null
        return {
          registration_id: a.registration_id,
          team_name: reg?.team_name ?? '',
          institution_name: reg?.institutions?.name ?? '',
          demo_slot: (slotMap.get(a.registration_id) as number | undefined) ?? null,
          venue_id: a.venue_assignment_id,
          submission: submission
            ? {
                id: submission.id,
                app_name: submission.app_name,
                live_app_url: submission.live_app_url,
                github_url: submission.github_url,
                user_count: submission.user_count ?? 0,
                active_users_count: submission.active_users_count ?? 0,
                mrr_amount: Number(submission.mrr_amount ?? 0),
                proof_urls: submission.proof_urls ?? [],
              }
            : null,
          verification: submission
            ? (verificationMap.get(submission.id) ?? null)
            : null,
        } satisfies EvaluatorTeamCard
      })
      .sort((a, b) => (a.demo_slot ?? 999) - (b.demo_slot ?? 999))
  }

  // ─── Evaluator: Upsert Verification ──────────────────────────────────────
  /**
   * Create or update a verification. Server recomputes score to prevent tampering.
   * Uses upsert on (submission_id, evaluator_id) unique constraint.
   */
  static async upsertVerification(
    dto: CreateVerificationDto,
    evaluatorProfileId: string
  ): Promise<AppathonVerification> {
    const supabase = createClientSupabaseClient() as any

    // Server-side score recomputation (do not trust client-sent scores)
    const score = AppathonVerificationService.calculateScore({
      app_live: dto.app_live,
      verified_users: dto.verified_users,
      verified_active_users: dto.verified_active_users,
      verified_revenue: dto.verified_revenue,
    })

    // Copy claimed values from submission at upsert time
    const { data: sub, error: subErr } = await supabase
      .from('event_submissions')
      .select('user_count, active_users_count, mrr_amount')
      .eq('id', dto.submission_id)
      .single()

    if (subErr || !sub) throw new Error(`Submission not found: ${dto.submission_id}`)

    const payload = {
      submission_id: dto.submission_id,
      evaluator_id: evaluatorProfileId,
      venue_id: dto.venue_id,
      presented: dto.presented,
      app_live: dto.app_live,
      claimed_users: sub?.user_count ?? 0,
      claimed_active_users: sub?.active_users_count ?? 0,
      claimed_revenue: Number(sub?.mrr_amount ?? 0),
      verified_users: dto.verified_users,
      verified_active_users: dto.verified_active_users,
      verified_revenue: dto.verified_revenue,
      verified_tier: score.tier,
      revenue_bonus: score.revenue_bonus,
      total_score: score.total_score,
      verification_status: dto.verification_status,
      flag_reason: dto.flag_reason ?? null,
      notes: dto.notes ?? null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('appathon_verifications')
      .upsert(payload, { onConflict: 'submission_id,evaluator_id' })
      .select()
      .single()

    if (error) throw error
    return data as AppathonVerification
  }

  // ─── Admin: Update Verification ───────────────────────────────────────────
  static async adminUpdateVerification(
    verificationId: string,
    dto: UpdateVerificationDto
  ): Promise<AppathonVerification> {
    const supabase = createClientSupabaseClient() as any

    // Recompute score if numeric fields changed
    let scoreUpdate: { verified_tier?: number; revenue_bonus?: number; total_score?: number } = {}
    if (
      dto.verified_users !== undefined ||
      dto.verified_active_users !== undefined ||
      dto.verified_revenue !== undefined ||
      dto.app_live !== undefined
    ) {
      const { data: current } = await supabase
        .from('appathon_verifications')
        .select('app_live, verified_users, verified_active_users, verified_revenue')
        .eq('id', verificationId)
        .single()

      if (current) {
        const score = AppathonVerificationService.calculateScore({
          app_live: dto.app_live ?? current.app_live,
          verified_users: dto.verified_users ?? current.verified_users,
          verified_active_users: dto.verified_active_users ?? current.verified_active_users,
          verified_revenue: Number(dto.verified_revenue ?? current.verified_revenue),
        })
        scoreUpdate = {
          verified_tier: score.tier,
          revenue_bonus: score.revenue_bonus,
          total_score: score.total_score,
        }
      }
    }

    // Strip undefined values — spreading undefined fields would serialize as null and overwrite DB data
    const safeDto = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined)
    )

    const { data, error } = await supabase
      .from('appathon_verifications')
      .update({ ...safeDto, ...scoreUpdate, updated_at: new Date().toISOString() })
      .eq('id', verificationId)
      .select()
      .single()

    if (error) throw error
    return data as AppathonVerification
  }

  // ─── Admin: Get Flagged Teams ─────────────────────────────────────────────
  static async getFlaggedVerifications(eventId: string): Promise<AppathonVerification[]> {
    const supabase = createClientSupabaseClient() as any

    const { data, error } = await supabase
      .from('appathon_verifications')
      .select(`
        *,
        event_submissions!inner(
          id, app_name, event_id,
          event_registrations!inner(team_name)
        ),
        profiles!evaluator_id(full_name)
      `)
      .eq('event_submissions.event_id', eventId)
      .in('verification_status', ['flagged', 'disqualified'])
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as AppathonVerification[]
  }

  // ─── Admin: Verified Leaderboard ─────────────────────────────────────────
  static async getVerifiedLeaderboard(eventId: string): Promise<VerifiedLeaderboardEntry[]> {
    const supabase = createClientSupabaseClient() as any

    const { data, error } = await supabase
      .from('appathon_leaderboard')
      .select('*')
      .eq('event_id', eventId)
      .order('overall_rank', { ascending: true })

    if (error) throw error
    return (data ?? []) as VerifiedLeaderboardEntry[]
  }

  // ─── Paginated Verified Leaderboard ──────────────────────────────────────
  static async getVerifiedLeaderboardPaginated(
    eventId: string,
    params: {
      page: number
      pageSize: number
      search?: string
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
      tierFilter?: number | null
      institutionId?: string | null
    }
  ): Promise<{
    data: VerifiedLeaderboardEntry[]
    pagination: { page: number; pageSize: number; totalPages: number; totalItems: number }
  }> {
    const supabase = createClientSupabaseClient() as any
    const { page, pageSize, search, sortBy = 'overall_rank', sortOrder = 'asc', tierFilter, institutionId } = params

    let query = supabase
      .from('appathon_leaderboard')
      .select('*', { count: 'exact' })
      .eq('event_id', eventId)

    // Search filter
    if (search?.trim()) {
      query = query.or(`team_name.ilike.%${search.trim()}%,app_name.ilike.%${search.trim()}%,institution_name.ilike.%${search.trim()}%`)
    }

    // Tier filter
    if (tierFilter != null) {
      query = query.eq('verified_tier', tierFilter)
    }

    // Institution filter
    if (institutionId) {
      query = query.eq('institution_id', institutionId)
    }

    // Sorting
    const validSortColumns = ['overall_rank', 'college_rank', 'total_score', 'verified_users', 'verified_active_users', 'verified_revenue', 'team_name', 'app_name', 'verified_tier']
    const col = validSortColumns.includes(sortBy) ? sortBy : 'overall_rank'
    query = query.order(col, { ascending: sortOrder === 'asc' })

    // Pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    const totalItems = count ?? 0
    return {
      data: (data ?? []) as VerifiedLeaderboardEntry[],
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
        totalItems,
      },
    }
  }

  // ─── Admin: Evaluator Progress ────────────────────────────────────────────
  static async getEvaluatorProgress(eventId: string): Promise<EvaluatorProgress[]> {
    const supabase = createClientSupabaseClient() as any

    const { data, error } = await supabase
      .from('evaluator_progress')
      .select('*')
      .eq('event_id', eventId)

    if (error) throw error
    return (data ?? []) as EvaluatorProgress[]
  }

  // ─── Admin: Freeze Metrics ────────────────────────────────────────────────
  static async freezeMetrics(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any
    const { error } = await supabase
      .from('startup_events')
      .update({ metrics_frozen_at: new Date().toISOString() })
      .eq('id', eventId)
    if (error) throw error
  }

  // ─── Admin: Publish Results ───────────────────────────────────────────────
  static async publishResults(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient() as any
    const { error } = await supabase
      .from('startup_events')
      .update({
        is_results_published: true,
        results_published_at: new Date().toISOString(),
      })
      .eq('id', eventId)
    if (error) throw error
  }
}
