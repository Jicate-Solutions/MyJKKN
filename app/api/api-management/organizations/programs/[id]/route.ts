import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get program with related details
  const { data: program, error: programError } = await auth.supabase
    .from('programs')
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
      ),
      department:departments (
        id,
        department_code,
        department_name
      )
    `
    )
    .eq('id', id)
    .single()

  if (programError) {
    if (programError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw programError
  }

  // Return response with CORS headers directly
  return NextResponse.json(program, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
