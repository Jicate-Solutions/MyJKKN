import { NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/api-keys/cors'
import { withAuth } from '@/lib/auth/with-auth'
import { errorResponse } from '@/lib/api-keys/response-helpers'
import { getStringParam } from '@/lib/api-keys/query-helpers'

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders })

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
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

  // Get institutions (scoped)
  let institutionsQuery = (auth.supabase as any)
    .from('institutions')
    .select('id, name, counselling_code')

  if (institutionId) {
    institutionsQuery = institutionsQuery.eq('id', institutionId)
  }

  const { data: institutions, error: institutionsError } = await institutionsQuery

  if (institutionsError) throw institutionsError

  // For each institution, get its departments
  const result = await Promise.all(
    (institutions ?? []).map(async (institution: any) => {
      let departmentsQuery = (auth.supabase as any)
        .from('departments')
        .select('id, department_code, department_name, is_active')
        .eq('institution_id', institution.id)

      if (isActive !== undefined) {
        departmentsQuery = departmentsQuery.eq('is_active', isActive === 'true')
      }

      const { data: departments, error: departmentsError } = await departmentsQuery

      if (departmentsError) throw departmentsError

      return {
        institution: {
          id: institution.id,
          name: institution.name,
          counselling_code: institution.counselling_code
        },
        departments: departments || []
      }
    })
  )

  return NextResponse.json(
    {
      data: result,
      metadata: {
        total: result.length,
        institutions_count: (institutions ?? []).length,
        departments_count: result.reduce(
          (acc: number, item: any) => acc + item.departments.length,
          0
        )
      }
    },
    { headers: corsHeaders }
  )
}, { allowApiKey: true, requiredPermission: 'read' })
