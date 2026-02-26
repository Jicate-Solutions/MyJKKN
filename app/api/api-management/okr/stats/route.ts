// app/api/api-management/okr/stats/route.ts
// External API for OKR Dashboard Statistics

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // Get query parameters
  const url = new URL(request.url)

  // Enforce institution scoping
  let institutionId: string | null = auth.institutionId
  if (auth.authMethod === 'api_key') {
    if (!institutionId) {
      return NextResponse.json(
        { error: 'API key must be scoped to an organization' },
        { status: 400, headers: corsHeaders }
      )
    }
  } else {
    // Session: allow super_admin to query specific institution
    const queryInstitutionId = url.searchParams.get('institution_id')
    if (queryInstitutionId && auth.user.role === 'super_admin') {
      institutionId = queryInstitutionId
    }
  }

  // Get objective counts (okr_objectives has institution_id)
  let objectiveQuery = (auth.supabase as any)
    .from('okr_objectives')
    .select('id, status', { count: 'exact' })

  if (institutionId) {
    objectiveQuery = objectiveQuery.eq('institution_id', institutionId)
  }

  const { data: objectives, count: totalObjectives } = await objectiveQuery

  const activeObjectives = objectives?.filter((o: any) => o.status === 'active').length || 0
  const completedObjectives = objectives?.filter((o: any) => o.status === 'completed').length || 0

  // Get KR status counts — scope via inner join to objectives with institution_id
  let krQuery = (auth.supabase as any)
    .from('okr_key_results')
    .select('status, data_source, objective:okr_objectives!inner(institution_id)')

  if (institutionId) {
    krQuery = krQuery.eq('objective.institution_id', institutionId)
  }

  const { data: keyResults } = await krQuery

  let onTrack = 0, atRisk = 0, behind = 0, blocked = 0
  let autoTracked = 0, manual = 0

  keyResults?.forEach((kr: any) => {
    switch (kr.status) {
      case 'on_track': onTrack++; break
      case 'at_risk': atRisk++; break
      case 'behind': behind++; break
      case 'blocked': blocked++; break
    }
    if (kr.data_source === 'auto') {
      autoTracked++
    } else {
      manual++
    }
  })

  // Calculate average progress (okr_objectives has institution_id)
  let progressQuery = (auth.supabase as any)
    .from('okr_objectives')
    .select('overall_progress')
    .eq('status', 'active')

  if (institutionId) {
    progressQuery = progressQuery.eq('institution_id', institutionId)
  }

  const { data: progressData } = await progressQuery

  const avgProgress = progressData && progressData.length > 0
    ? Math.round(
        progressData.reduce((sum: number, o: any) => sum + (o.overall_progress || 0), 0) /
        progressData.length
      )
    : 0

  // Get check-in completion rate (last 4 weeks)
  // okr_check_ins has no institution_id — scoped via RLS + impersonated client
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
  const { data: checkIns } = await (auth.supabase as any)
    .from('okr_check_ins')
    .select('is_completed')
    .gte('created_at', fourWeeksAgo)

  const completionRate = checkIns && checkIns.length > 0
    ? Math.round(
        (checkIns.filter((c: any) => c.is_completed).length / checkIns.length) * 100
      )
    : 0

  const stats = {
    total_objectives: totalObjectives || 0,
    active_objectives: activeObjectives,
    completed_objectives: completedObjectives,
    on_track_count: onTrack,
    at_risk_count: atRisk,
    behind_count: behind,
    blocked_count: blocked,
    avg_progress: avgProgress,
    check_in_completion_rate: completionRate,
    auto_tracked_krs: autoTracked,
    manual_krs: manual
  }

  return NextResponse.json({ data: stats }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
