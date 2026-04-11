import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { corsHeaders } from '@/lib/api-keys/cors'

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
    const { data: enrollments, error: fetchError } = await supabase
      .from('sf100_enrollments')
      .select('current_phase, cumulative_paid_users')
      .eq('program_id', programId)
      .in('status', ['active', 'warning', 'probation', 'graduated'])
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
