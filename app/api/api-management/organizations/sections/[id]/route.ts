import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Get section by ID - select all fields
  const { data: section, error: sectionError } = await auth.supabase
    .from('sections')
    .select('*')
    .eq('id', id)
    .single()

  if (sectionError) {
    if (sectionError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw sectionError
  }

  // Return response with CORS headers
  return NextResponse.json({ data: section }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
