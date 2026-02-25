import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Fetch regulation by ID - select all fields
  const { data: regulation, error } = await auth.supabase
    .from('regulations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !regulation) {
    return NextResponse.json(
      { error: 'Regulation not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  return NextResponse.json({ data: regulation }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
