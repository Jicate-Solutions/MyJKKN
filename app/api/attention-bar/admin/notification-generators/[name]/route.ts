/**
 * PATCH /api/attention-bar/admin/notification-generators/[name]
 *   — update a single notification_generator_config row
 *
 * Body: { config?: object, is_active?: boolean, description?: string, reason?: string }
 *
 * Auth: super_admin OR attention_bar.rules.manage
 *
 * `reason` is captured into the audit row's `reason` column via a separate
 * pre-write because the trigger only sees old/new config — it can't see the
 * UPDATE statement's "why". We write the audit row's reason inline by sneaking
 * it through a secondary UPDATE on the audit table immediately after.
 */

import { NextResponse } from 'next/server';
import { createClient, getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UpdateBody {
  config?: Record<string, unknown>;
  is_active?: boolean;
  description?: string;
  reason?: string;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
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

  const { name } = await context.params;
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Invalid generator name' }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_by: profile.id };
  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      return NextResponse.json({ error: 'config must be a JSON object' }, { status: 400 });
    }
    updates.config = body.config;
  }
  if (body.is_active !== undefined) {
    updates.is_active = !!body.is_active;
  }
  if (body.description !== undefined) {
    updates.description = String(body.description).slice(0, 1000);
  }

  if (Object.keys(updates).length === 1) {
    // only updated_by — no actual change
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const { data: updated, error: updateErr } = await supabase
      .from('notification_generator_config')
      .update(updates)
      .eq('generator_name', name)
      .select()
      .single();

    if (updateErr) throw updateErr;
    if (!updated) {
      return NextResponse.json({ error: 'Generator not found' }, { status: 404 });
    }

    // Stamp the most recent audit row's reason with the user-supplied
    // change_reason. The audit trigger fires AFTER the UPDATE, so the audit
    // row exists by the time we get here.
    if (body.reason && body.reason.trim()) {
      const reason = body.reason.trim().slice(0, 500);
      const { data: latestAudit } = await supabase
        .from('notification_generator_config_audit')
        .select('id')
        .eq('generator_name', name)
        .eq('operation', 'UPDATE')
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();

      if (latestAudit?.id) {
        await supabase
          .from('notification_generator_config_audit')
          .update({ reason })
          .eq('id', latestAudit.id);
      }
    }

    return NextResponse.json({ row: updated });
  } catch (err) {
    console.error('[attention-bar/admin/notification-generators PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
