import { NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/api-keys/cors'
import { withAuth } from '@/lib/auth/with-auth'
import { paginatedResponse, errorResponse } from '@/lib/api-keys/response-helpers'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders })

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit, from, to } = getPaginationParams(url)
  const search = getStringParam(url, 'search')
  const degreeId = getStringParam(url, 'degree_id')
  const isActive = getStringParam(url, 'isActive')

  let institutionId: string | null = auth.institutionId

  if (auth.authMethod === 'session') {
    const queryInstitutionId = url.searchParams.get('institution_id')
    if (queryInstitutionId && auth.user?.role === 'super_admin') {
      institutionId = queryInstitutionId
    }
  }

  if (auth.authMethod === 'api_key' && !institutionId) {
    return errorResponse('API key must be associated with an organization', 400)
  }

  let query = (auth.supabase as any).from('departments').select(`
    *,
    institution:institutions (
      id,
      name,
      counselling_code
    ),
    degree:degrees (
      id,
      degree_id,
      degree_name
    )
  `, { count: 'exact' })

  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  if (search) {
    query = query.or(
      `department_code.ilike.%${search}%,department_name.ilike.%${search}%`
    )
  }

  if (degreeId) {
    query = query.eq('degree_id', degreeId)
  }

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive === 'true')
  }

  query = query.range(from, to).order('created_at', { ascending: false })

  const { data, error, count } = await query

  if (error) throw error

  return paginatedResponse(data ?? [], count ?? 0, page, limit)
}, { allowApiKey: true, requiredPermission: 'read' })
