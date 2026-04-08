

// app/api/startup-studio/events/[id]/export/verifications/route.ts
import { NextRequest, NextResponse, connection } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    // Auth check — admin only
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['super_admin', 'administrator'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch verification data with joined info
    let query = supabase
      .from('appathon_verifications')
      .select(`
        *,
        event_submissions(
          event_id, app_name, live_app_url,
          event_registrations(
            team_name, institution_id,
            institutions(name)
          )
        ),
        profiles!evaluator_id(full_name)
      `)
      .eq('event_submissions.event_id', id)
      .order('total_score', { ascending: false })

    // Scope to own institution for administrator role
    if (profile.role === 'administrator') {
      if (!profile.institution_id) {
        return NextResponse.json({ error: 'Administrator has no institution assigned' }, { status: 403 })
      }
      query = query.eq('event_submissions.event_registrations.institution_id', profile.institution_id)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const headers = [
      'Team Name', 'App Name', 'College', 'Live URL',
      'Claimed Users', 'Verified Users',
      'Claimed Active', 'Verified Active',
      'Claimed Revenue (₹)', 'Verified Revenue (₹)',
      'Tier Level', 'Revenue Bonus', 'Total Score',
      'Status', 'Flag Reason', 'Notes', 'Evaluator',
    ]

    const escapeCell = (val: unknown) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`

    const rows = (data ?? []).map(v => {
      const sub = (v as any).event_submissions
      const reg = sub?.event_registrations
      return [
        reg?.team_name,
        sub?.app_name,
        reg?.institutions?.name,
        sub?.live_app_url,
        v.claimed_users,
        v.verified_users,
        v.claimed_active_users,
        v.verified_active_users,
        v.claimed_revenue,
        v.verified_revenue,
        v.verified_tier,
        v.revenue_bonus,
        v.total_score,
        v.verification_status,
        v.flag_reason,
        v.notes,
        (v as any).profiles?.full_name,
      ].map(escapeCell)
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="demo-day-verifications-${id}.csv"`,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
