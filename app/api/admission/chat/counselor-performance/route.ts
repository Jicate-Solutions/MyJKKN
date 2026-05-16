export const dynamic = 'force-dynamic';

// GET /api/admission/chat/counselor-performance
// Counselor performance metrics and response time distribution
//
// Permission gate is delegated to withAuth({ requirePermission:
// 'admission.counselors.performance.view' }). The wrapper triad handles
// super-admin bypass + is_admin + user_has_permission. Per-institution
// access is still scoped here via profile.institution_id match.

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { WhatsAppCounselorAnalyticsService } from '@/lib/services/whatsapp/whatsapp-counselor-analytics-service';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const dateFrom = searchParams.get('from') || undefined;
    const dateTo = searchParams.get('to') || undefined;
    const counselorId = searchParams.get('counselor_id') || undefined;

    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Verify institution access (super admins can access any institution).
    // The wrapper has already confirmed the user has the permission key; we
    // additionally enforce that non-global users can only query their own
    // institution. Cross-institution access for global-scope roles is granted
    // via custom_roles.institution_scope='all' (RLS-side); we enforce the
    // same here so this analytics endpoint matches the data the user could
    // see via RLS-bound queries.
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

    if (!isSuperAdmin && profile?.institution_id !== institutionId) {
      // Allow if user has any role with institution_scope='all'.
      const { data: scopedRoles } = await supabase
        .from('user_roles')
        .select('custom_roles!inner(institution_scope)')
        .eq('user_id', user.id);
      const hasGlobalScope = (scopedRoles || []).some(
        (ur: any) => ur.custom_roles?.institution_scope === 'all'
      );
      if (!hasGlobalScope) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // If counselor_id provided, return timeline for that counselor
    if (counselorId) {
      const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString();
      const to = dateTo || new Date().toISOString();

      const timeline = await WhatsAppCounselorAnalyticsService.getCounselorTimeline(
        counselorId,
        institutionId,
        from,
        to
      );

      return NextResponse.json({ timeline });
    }

    // Otherwise return all counselor metrics + distribution
    const [counselors, distribution] = await Promise.all([
      WhatsAppCounselorAnalyticsService.getCounselorPerformance(
        institutionId,
        dateFrom,
        dateTo
      ),
      WhatsAppCounselorAnalyticsService.getResponseTimeDistribution(
        institutionId,
        dateFrom,
        dateTo
      ),
    ]);

    return NextResponse.json({ counselors, distribution });
  } catch (error) {
    console.error('[chat/counselor-performance] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'admission.counselors.performance.view' });
