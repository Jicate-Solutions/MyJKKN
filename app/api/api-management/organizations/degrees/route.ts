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
  const institutionId = url.searchParams.get('institution_id')
  const degreeType = url.searchParams.get('degree_type')
  const isActive = url.searchParams.get('isActive')

  // Build query
  let query = (auth.supabase as any).from('degrees').select(
    `
    *,
    institution:institutions (
      id,
      name,
        counselling_code
      )
  `,
    { count: 'exact' }
  )

  // Apply filters
  if (search) {
    query = query.or(
      `degree_id.ilike.%${search}%,degree_name.ilike.%${search}%`
    )
  }

  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  if (degreeType) {
    query = query.eq('degree_type', degreeType)
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true')
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  // Execute query
  const { data: degrees, error, count } = await query

  if (error) throw error

  // Return response with CORS headers directly
  return NextResponse.json(
    {
      data: degrees || [],
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
