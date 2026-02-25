// app/api/api-management/okr/compliance/route.ts
// External API for OKR Compliance (blocked users, user status)

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
  const badge = url.searchParams.get('badge') // green, yellow, red, blocked
  const isBlocked = url.searchParams.get('is_blocked')

  // Build query
  let query = (auth.supabase as any)
    .from('okr_user_status')
    .select(`
      *,
      user:auth.users!user_id(id, email, raw_user_meta_data)
    `, { count: 'exact' })

  // Apply filters
  if (userId) {
    query = query.eq('user_id', userId)
  }
  if (badge) {
    query = query.eq('current_badge', badge)
  }
  if (isBlocked !== null) {
    if (isBlocked === 'true') {
      query = query.eq('current_badge', 'blocked')
    } else {
      query = query.neq('current_badge', 'blocked')
    }
  }

  // Apply pagination
  const from = (page - 1) * limit
  query = query
    .range(from, from + limit - 1)
    .order('updated_at', { ascending: false })

  const { data, error, count } = await query

  if (error) throw error

  // Calculate summary
  const summary = {
    total: count || 0,
    green: 0,
    yellow: 0,
    red: 0,
    blocked: 0
  }

  if (data) {
    data.forEach((status: any) => {
      switch (status.current_badge) {
        case 'green': summary.green++; break
        case 'yellow': summary.yellow++; break
        case 'red': summary.red++; break
        case 'blocked': summary.blocked++; break
      }
    })
  }

  return NextResponse.json({
    data: data || [],
    summary,
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
