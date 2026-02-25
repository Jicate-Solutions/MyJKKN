import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!

  // Fetch batch by ID - select all fields
  const { data: batch, error } = await auth.supabase
    .from('batches')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !batch) {
    return NextResponse.json(
      { error: 'Batch not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  return NextResponse.json({ data: batch }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
