// app/api/api-management/okr/team/route.ts
// External API for OKR Team Summary

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // Get query parameters
  const url = new URL(request.url)
  const managerId = url.searchParams.get('manager_id')

  // Get team summary from view
  let query = (auth.supabase as any)
    .from('v_team_okr_summary')
    .select('*')

  if (managerId) {
    query = query.eq('manager_id', managerId)
  }

  const { data: teamData, error: teamError } = await query

  if (teamError) throw teamError

  // Get user statuses
  const { data: userStatuses, error: statusError } = await (auth.supabase as any)
    .from('okr_user_status')
    .select(`
      *,
      user:auth.users!user_id(id, email, raw_user_meta_data)
    `)

  if (statusError) throw statusError

  // Aggregate the data
  const summary = {
    total_objectives: 0,
    on_track: 0,
    at_risk: 0,
    behind: 0,
    blocked_users: 0,
    overdue_checkins: 0,
    team_members: [] as any[]
  }

  if (teamData && teamData.length > 0) {
    const aggregated = teamData[0]
    summary.total_objectives = aggregated.total_objectives || 0
    summary.on_track = aggregated.on_track_count || 0
    summary.at_risk = aggregated.at_risk_count || 0
    summary.behind = aggregated.behind_count || 0
    summary.blocked_users = aggregated.blocked_count || 0
    summary.overdue_checkins = aggregated.overdue_checkins || 0
  }

  if (userStatuses) {
    summary.team_members = userStatuses.map((status: any) => ({
      user_id: status.user_id,
      user: {
        id: status.user?.id,
        email: status.user?.email,
        first_name: status.user?.raw_user_meta_data?.first_name,
        last_name: status.user?.raw_user_meta_data?.last_name,
        full_name: status.user?.raw_user_meta_data?.full_name
      },
      objectives_count: status.total_objectives || 0,
      average_progress: status.total_objectives > 0
        ? Math.round((status.on_track_count / status.total_objectives) * 100)
        : 0,
      last_check_in_date: status.last_check_in_date,
      badge: status.current_badge,
      is_blocked: status.current_badge === 'blocked'
    }))
  }

  return NextResponse.json({ data: summary }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
