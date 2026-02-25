// app/api/api-management/okr/objectives/route.ts
// External API for OKR Objectives

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
  const institutionId = url.searchParams.get('institution_id')
  const departmentId = url.searchParams.get('department_id')
  const ownerId = url.searchParams.get('owner_id')
  const tier = url.searchParams.get('tier')
  const level = url.searchParams.get('level')
  const status = url.searchParams.get('status')
  const cycleType = url.searchParams.get('cycle_type')
  const search = url.searchParams.get('search')

  // Build query
  let query = (auth.supabase as any)
    .from('okr_objectives')
    .select(`
      *,
      owner:auth.users!owner_id(id, email, raw_user_meta_data),
      institution:institutions(id, name),
      department:departments(id, department_name),
      key_results:okr_key_results(*)
    `, { count: 'exact' })

  // Apply filters
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }
  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }
  if (ownerId) {
    query = query.eq('owner_id', ownerId)
  }
  if (tier) {
    query = query.eq('tier', tier)
  }
  if (level) {
    query = query.eq('level', level)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (cycleType) {
    query = query.eq('cycle_type', cycleType)
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  // Apply pagination
  const from = (page - 1) * limit
  query = query
    .range(from, from + limit - 1)
    .order('created_at', { ascending: false })

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
