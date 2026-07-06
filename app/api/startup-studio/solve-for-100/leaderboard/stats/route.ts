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
    // from the public stats. Metrics are read LIVE from the sf100_enrollments
    // extension below; the extension status filter stays authoritative. `null` →
    // the program has no enrollments → the `.eq('program_id')` fallback returns 0
    // rows too (identical).
    const rosterIds = await resolveRosterEnrollmentIds(supabase, programId)

    let query = supabase
      .from('sf100_enrollments')
      .select('current_phase, cumulative_paid_users')
      .in('status', ['active', 'warning', 'probation', 'graduated'])
    query = rosterIds ? query.in('id', rosterIds) : query.eq('program_id', programId)
    const { data: enrollments, error: fetchError } = await query
    if (fetchError) throw new Error(fetchError.message)
    const rows = enrollments || []
    const data = { total_teams: rows.length, total_paid_users: rows.reduce((s: number, r: any) => s + (r.cumulative_paid_users || 0), 0), total_graduated: rows.filter((r: any) => r.current_phase === 'graduated').length, avg_days_to_first_sale: null }
    return NextResponse.json({ data }, { headers: corsHeaders })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    )
  }
}
