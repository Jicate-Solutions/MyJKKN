import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // Get query parameters
  const url = new URL(request.url)

  // Check if client wants all records without pagination
  // Usage: ?all=true to fetch all staff records
  const fetchAll = url.searchParams.get('all') === 'true'
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = parseInt(url.searchParams.get('limit') || '10')
  const search = url.searchParams.get('search')
  const institutionId = url.searchParams.get('institution_id')
  const departmentId = url.searchParams.get('department_id')
  const categoryId = url.searchParams.get('category_id')
  const isActive = url.searchParams.get('is_active')

  // Build query
  let query = (auth.supabase as any).from('staff').select(
    `
    *,
    category:employment_categories(id, category_name),
    institution:institutions(id, name),
    department:departments(id, department_name)
    `,
    { count: 'exact' }
  )

  // Apply filters
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,staff_id.ilike.%${search}%`
    )
  }

  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true')
  }

  // Apply pagination only if not fetching all records
  if (!fetchAll) {
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)
  }

  // Always apply ordering
  query = query.order('created_at', { ascending: false })

  // Execute query
  const { data: staff, error, count } = await query

  if (error) throw error

  return NextResponse.json(
    {
      data: staff || [],
      metadata: fetchAll
        ? {
            total: count || 0,
            all: true,
            returned: staff?.length || 0
          }
        : {
            total: count || 0,
            page,
            limit,
            totalPages: count ? Math.ceil(count / limit) : 0,
            returned: staff?.length || 0
          }
    },
    { headers: corsHeaders }
  )
}, { allowApiKey: true, requiredPermission: 'read' })
