import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get semester by ID - select all fields
  const { data: semester, error: semesterError } = await auth.supabase
    .from('semesters')
    .select('*')
    .eq('id', id)
    .single()

  if (semesterError) {
    if (semesterError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Semester not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw semesterError
  }

  // Return response with CORS headers
  return NextResponse.json({ data: semester }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
