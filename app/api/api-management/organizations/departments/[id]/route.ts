import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get department with institution details
  const { data: department, error: departmentError } = await auth.supabase
    .from('departments')
    .select(
      `
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
    `
    )
    .eq('id', id)
    .single()

  if (departmentError) {
    if (departmentError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw departmentError
  }

  // Return response with CORS headers directly
  return NextResponse.json(department, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
