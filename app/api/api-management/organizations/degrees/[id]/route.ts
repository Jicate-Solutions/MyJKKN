import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get degree with institution details
  const { data: degrees, error: degreesError } = await auth.supabase
    .from('degrees')
    .select(
      `
      *,
      institution:institutions (
        id,
        name,
        counselling_code
      )
    `
    )
    .eq('id', id)
    .single()

  if (degreesError) {
    if (degreesError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Degree not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw degreesError
  }

  // Return response with CORS headers directly
  return NextResponse.json(degrees, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
