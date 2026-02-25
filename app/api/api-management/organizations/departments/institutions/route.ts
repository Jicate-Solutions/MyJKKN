import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // Get query parameters
  const url = new URL(request.url)
  const institutionId = url.searchParams.get('institution_id')
  const isActive = url.searchParams.get('isActive')

  // First, get all institutions
  let institutionsQuery = auth.supabase
    .from('institutions')
    .select('id, name, counselling_code')

  if (institutionId) {
    institutionsQuery = institutionsQuery.eq('id', institutionId)
  }

  const { data: institutions, error: institutionsError } =
    await institutionsQuery

  if (institutionsError) throw institutionsError

  // For each institution, get its departments
  const result = await Promise.all(
    institutions.map(async (institution: any) => {
      let departmentsQuery = auth.supabase
        .from('departments')
        .select('id, department_code, department_name, is_active')
        .eq('institution_id', institution.id)

      if (isActive !== null) {
        departmentsQuery = departmentsQuery.eq(
          'is_active',
          isActive === 'true'
        )
      }

      const { data: departments, error: departmentsError } =
        await departmentsQuery

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

  // Return response with CORS headers directly
  return NextResponse.json(
    {
      data: result,
      metadata: {
        total: result.length,
        institutions_count: institutions.length,
        departments_count: result.reduce(
          (acc: number, item: any) => acc + item.departments.length,
          0
        )
      }
    },
    { headers: corsHeaders }
  )
}, { allowApiKey: true, requiredPermission: 'read' })
