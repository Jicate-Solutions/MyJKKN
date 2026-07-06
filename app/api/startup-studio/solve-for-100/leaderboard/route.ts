import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { corsHeaders } from '@/lib/api-keys/cors'
import { resolveRosterEnrollmentIds } from '@/lib/services/startup-studio/sf100-service'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const programId = request.nextUrl.searchParams.get('program_id')
    if (!programId) {
      return NextResponse.json(
        { error: 'program_id required' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabase = createServiceRoleClient()

    // Program roster scoped by sf100_enrollments.program_id as the AUTHORITATIVE
    // base, folded (union) with the cohort spine — via the single shared resolver —
    // so a partial/incomplete cohort_memberships set can never silently drop a team
    // from the public leaderboard. current_phase & cumulative_paid_users are still
    // read LIVE from the sf100_enrollments extension below (never the stale
    // membership.config snapshot); the extension status filter stays authoritative.
    // `null` → the program has no enrollments → the `.eq('program_id')` fallback
    // returns 0 rows too (identical).
    const rosterIds = await resolveRosterEnrollmentIds(supabase, programId)

    // Fetch enrollments with registration (SF100 per-team fields from the extension).
    // Apply the program/roster filter BEFORE .order() so the builder stays a filter
    // builder, then order at await-time.
    let query = supabase
      .from('sf100_enrollments')
      .select(`
        id,
        current_phase,
        cumulative_paid_users,
        enrolled_at,
        registration:event_registrations(id, team_name, institution_id)
      `)
      .in('status', ['active', 'warning', 'probation', 'graduated'])
    query = rosterIds ? query.in('id', rosterIds) : query.eq('program_id', programId)
    const { data: rows, error: fetchError } = await query
      .order('cumulative_paid_users', { ascending: false })
      .order('enrolled_at', { ascending: true })

    if (fetchError) throw new Error(fetchError.message)

    // Get all registration IDs to fetch member college info from Form 1 data
    // For now, use the institution mapping from event_team_members
    // But since members don't have institution_id, we'll use Form 1 data stored in phase_history evidence

    // Fetch all institutions for name lookup
    const { data: allInsts } = await supabase.from('institutions').select('id, name')
    const instMap: Record<string, string> = {}
    const instShortName: Record<string, string> = {}
    for (const inst of allInsts || []) {
      instMap[inst.id] = inst.name
      // Create short names: "JKKN College of Engineering and Technology" -> "Engineering"
      const name = inst.name as string
      if (name.includes('Engineering')) instShortName[inst.id] = 'Engineering'
      else if (name.includes('Dental')) instShortName[inst.id] = 'Dental'
      else if (name.includes('Pharmacy')) instShortName[inst.id] = 'Pharmacy'
      else if (name.includes('Nursing')) instShortName[inst.id] = 'Nursing'
      else if (name.includes('Arts') || name.includes('Science')) instShortName[inst.id] = 'Arts & Science'
      else if (name.includes('Allied') || name.includes('AHS')) instShortName[inst.id] = 'Allied Health'
      else if (name.includes('Education')) instShortName[inst.id] = 'Education'
      else instShortName[inst.id] = name.replace('JKKN ', '').replace('College of ', '').substring(0, 20)
    }

    // Fetch phase_history evidence which contains member college data from Form 1
    const enrollmentIds = (rows || []).map((r: any) => r.id)
    const teamColleges: Record<string, string[]> = {}

    if (enrollmentIds.length > 0) {
      const { data: histories } = await supabase
        .from('sf100_phase_history')
        .select('enrollment_id, evidence')
        .in('enrollment_id', enrollmentIds)
        .not('evidence', 'is', null)

      for (const h of histories || []) {
        const evidence = h.evidence as any
        // The seed script stored form data in evidence
        if (evidence?.members_text || evidence?.college) {
          const colleges: string[] = []
          // Try to extract colleges from members text
          const membersText = evidence.members_text || ''
          const lines = membersText.split('\n').filter((l: string) => l.trim())
          for (const line of lines) {
            const lower = line.toLowerCase()
            if (lower.includes('dental') || lower.includes('bds')) colleges.push('Dental')
            else if (lower.includes('engineering') || lower.includes('eee') || lower.includes('cse') || lower.includes('it ') || lower.includes('ece')) colleges.push('Engineering')
            else if (lower.includes('pharmacy') || lower.includes('pharm')) colleges.push('Pharmacy')
            else if (lower.includes('nursing')) colleges.push('Nursing')
            else if (lower.includes('microbiology') || lower.includes('arts') || lower.includes('science') || lower.includes('commerce') || lower.includes('english')) colleges.push('Arts & Science')
            else if (lower.includes('allied') || lower.includes('ahs')) colleges.push('Allied Health')
          }
          // Also check the college field directly
          if (evidence.college) {
            colleges.push(evidence.college)
          }
          teamColleges[h.enrollment_id] = [...new Set(colleges)]
        }
      }
    }

    // Build phase groups
    const PHASE_ORDER = ['graduated', 'hundred_users', 'growth', 'first_users', 'problem_solution_fit', 'setup']
    const PHASE_LABELS: Record<string, string> = {
      graduated: 'Graduated',
      hundred_users: '100 Users',
      growth: 'Growth (25+)',
      first_users: 'First Users (5+)',
      problem_solution_fit: 'Problem-Solution Fit',
      setup: 'Setup',
    }

    const phaseGroups: Record<string, any[]> = {}
    for (const row of rows || []) {
      const phase = (row as any).current_phase
      if (!phaseGroups[phase]) phaseGroups[phase] = []

      const instId = (row as any).registration?.institution_id
      const regCollege = instShortName[instId] || 'Unknown'

      // Get member colleges — prefer phase_history evidence, fall back to registration institution
      let colleges = teamColleges[row.id]
      if (!colleges || colleges.length === 0) {
        colleges = [regCollege]
      }

      phaseGroups[phase].push({
        enrollment_id: row.id,
        team_name: (row as any).registration?.team_name || 'Unknown',
        colleges: colleges,
        institution_name: regCollege, // backwards compat
        current_phase: phase,
        cumulative_paid_users: (row as any).cumulative_paid_users || 0,
        phase_rank: 0,
      })
    }

    const phases = PHASE_ORDER
      .filter(p => phaseGroups[p]?.length > 0)
      .map(p => {
        phaseGroups[p].forEach((t: any, i: number) => { t.phase_rank = i + 1 })
        return { phase: p, phase_label: PHASE_LABELS[p], teams: phaseGroups[p] }
      })

    const allTeams = rows || []
    const data = {
      phases,
      total_teams: allTeams.length,
      total_paid_users: allTeams.reduce((s: number, r: any) => s + (r.cumulative_paid_users || 0), 0),
      total_graduated: (phaseGroups['graduated'] || []).length,
    }

    return NextResponse.json({ data }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
