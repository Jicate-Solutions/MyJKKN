// app/api/api-management/okr/check-ins/route.ts
// External API for OKR Check-ins

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // Get query parameters
  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100)
  const userId = url.searchParams.get('user_id')
  const weekNumber = url.searchParams.get('week_number')
  const year = url.searchParams.get('year')
  const isCompleted = url.searchParams.get('is_completed')
  const isOverdue = url.searchParams.get('is_overdue')

  // Enforce institution scoping
  // okr_check_ins has no direct institution_id — data is scoped via RLS + impersonated client
  let institutionId: string | null = auth.institutionId
  if (auth.authMethod === 'api_key') {
    if (!institutionId) {
      return NextResponse.json(
        { error: 'API key must be scoped to an organization' },
        { status: 400, headers: corsHeaders }
      )
    }
  } else {
    const queryInstitutionId = url.searchParams.get('institution_id')
    if (queryInstitutionId && auth.user.role === 'super_admin') {
      institutionId = queryInstitutionId
    }
  }

  // Build query
  let query = (auth.supabase as any)
    .from('okr_check_ins')
    .select(`
      *,
      user:auth.users!user_id(id, email, raw_user_meta_data),
      kr_updates:okr_kr_updates(
        *,
        key_result:okr_key_results(id, title)
      )
    `, { count: 'exact' })

  // Apply filters
  if (userId) {
    query = query.eq('user_id', userId)
  }
  if (weekNumber) {
    query = query.eq('week_number', parseInt(weekNumber))
  }
  if (year) {
    query = query.eq('year', parseInt(year))
  }
  if (isCompleted !== null) {
    query = query.eq('is_completed', isCompleted === 'true')
  }
  if (isOverdue !== null) {
    query = query.eq('is_overdue', isOverdue === 'true')
  }

  // Apply pagination
  const from = (page - 1) * limit
  query = query
    .range(from, from + limit - 1)
    .order('due_date', { ascending: false })

  const { data, error, count } = await query

  if (error) throw error

  return NextResponse.json({
    data: data || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
