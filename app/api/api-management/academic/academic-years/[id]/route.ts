import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Fetch academic year by ID - select all fields
  const { data: academicYear, error } = await auth.supabase
    .from('academic_years')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !academicYear) {
    return NextResponse.json(
      { error: 'Academic year not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  return NextResponse.json({ data: academicYear }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
