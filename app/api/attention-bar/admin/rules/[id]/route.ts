/**
 * PATCH  /api/attention-bar/admin/rules/[id]   — update a rule
 * DELETE /api/attention-bar/admin/rules/[id]   — delete a rule
 *
 * Auth: super_admin OR attention_bar.rules.manage
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertPermission(isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) return true;
  const supabase = await createClient();
  const { data } = await supabase.rpc('user_has_permission', {
    permission_name: 'attention_bar.rules.manage',
  });
  return !!data;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await assertPermission(profile.is_super_admin === true);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    // Only allow updating safe fields
    const {
      rule_name,
      description,
      page,
      role,
      when_clause,
      action_template,
      priority,
      is_active,
      institution_id,
    } = body;

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (rule_name !== undefined) updatePayload.rule_name = rule_name;
    if (description !== undefined) updatePayload.description = description;
    if (page !== undefined) updatePayload.page = page;
    if (role !== undefined) updatePayload.role = role;
    if (when_clause !== undefined) updatePayload.when_clause = when_clause;
    if (action_template !== undefined) updatePayload.action_template = action_template;
    if (priority !== undefined) updatePayload.priority = priority;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (institution_id !== undefined) updatePayload.institution_id = institution_id;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('quick_action_rules')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ rule: data });
  } catch (err) {
    console.error('[attention-bar/admin/rules PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await assertPermission(profile.is_super_admin === true);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('quick_action_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[attention-bar/admin/rules DELETE] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
