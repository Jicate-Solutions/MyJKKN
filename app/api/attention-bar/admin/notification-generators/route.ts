/**
 * GET /api/attention-bar/admin/notification-generators
 *   — list all notification_generator_config rows + recent audit
 *
 * Auth: super_admin OR attention_bar.rules.manage
 *
 * Wave B.3 — Tab 8 admin UI for the notification-generator-policy program
 * (B.1 substrate + B.2 refactors → this UI).
 */

import { NextResponse } from 'next/server';
import { createClient, getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  const supabase = await createClient();

  if (!isSuperAdmin) {
    const { data: hasManage } = await supabase.rpc('user_has_permission', {
      permission_name: 'attention_bar.rules.manage',
    });
    if (!hasManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const { data: rows, error: rowsErr } = await supabase
      .from('notification_generator_config')
      .select('*')
      .order('generator_name', { ascending: true });

    if (rowsErr) throw rowsErr;

    // Pull last 20 audit entries across all generators for activity feed.
    const { data: audit, error: auditErr } = await supabase
      .from('notification_generator_config_audit')
      .select('id, generator_name, operation, changed_at, changed_by, reason, old_config, new_config')
      .order('changed_at', { ascending: false })
      .limit(20);

    if (auditErr) throw auditErr;

    return NextResponse.json({
      rows: rows ?? [],
      audit: audit ?? [],
    });
  } catch (err) {
    console.error('[attention-bar/admin/notification-generators GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
