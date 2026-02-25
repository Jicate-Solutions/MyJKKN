import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get course by ID - select all fields
  const { data: course, error: courseError } = await auth.supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single()

  if (courseError) {
    if (courseError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw courseError
  }

  // Return response with CORS headers
  return NextResponse.json({ data: course }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
