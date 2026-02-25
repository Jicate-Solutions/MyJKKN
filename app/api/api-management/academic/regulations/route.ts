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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const regulationYear = url.searchParams.get('regulation_year')
  const isActive = url.searchParams.get('is_active')

  // Build query - select all fields
  let query = (auth.supabase as any)
    .from('regulations')
    .select('*', { count: 'exact' })

  // Apply filters
  if (regulationYear) {
    query = query.eq('regulation_year', regulationYear)
  }

  if (isActive !== null && isActive !== undefined) {
    query = query.eq('is_active', isActive === 'true')
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  // Execute query
  const { data: regulations, error, count } = await query

  if (error) throw error

  // Return response with CORS headers
  return NextResponse.json(
    {
      count: count || 0,
      data: regulations || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    },
    { headers: corsHeaders }
  )
}, { allowApiKey: true, requiredPermission: 'read' })
