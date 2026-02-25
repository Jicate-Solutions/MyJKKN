import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get institution with departments
  const { data: institution, error: institutionError } = await auth.supabase
    .from('institutions')
    .select(
      `
      *,
      departments:departments(*)
    `
    )
    .eq('id', id)
    .single()

  if (institutionError) {
    if (institutionError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Institution not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw institutionError
  }

  return NextResponse.json(institution, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
