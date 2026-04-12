import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const { data, error } = await auth.supabase
    .from('sf100_roster_changes')
    .select('*, enrollment:sf100_enrollments(id, registration:event_registrations(team_name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw new Error('Failed to fetch pending roster changes: ' + error.message)

  return successApiResponse(data || [])
}, { requiredPermission: 'read' })
