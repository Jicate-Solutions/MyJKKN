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
  const limit = parseInt(url.searchParams.get('limit') || '10')
  const search = url.searchParams.get('search')
  const isActive = url.searchParams.get('isActive')

  // Build query
  let query = (auth.supabase as any).from('institutions').select('*', { count: 'exact' })

  // Apply filters
  if (search) {
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true')
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  // Execute query
  const { data: institutions, error, count } = await query

  if (error) throw error

  return NextResponse.json(
    {
      data: institutions || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    },
    { headers: corsHeaders }
  )
}, { allowApiKey: true, requiredPermission: 'read' })
