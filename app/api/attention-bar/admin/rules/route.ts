/**
 * GET  /api/attention-bar/admin/rules          — list all rules (paginated)
 * POST /api/attention-bar/admin/rules          — create a rule
 *
 * Auth: super_admin OR attention_bar.rules.manage
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertPermission(isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  const supabase = await createClient();
  const { data } = await supabase.rpc('user_has_permission', {
    permission_name: 'attention_bar.rules.manage',
  });
  return !!data;
}

export async function GET(request: Request) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10), 100);
  const offset = (page - 1) * pageSize;

  const supabase = await createClient();

  if (!isSuperAdmin) {
    const { data: hasView } = await supabase.rpc('user_has_permission', {
      permission_name: 'attention_bar.rules.view',
    });
    if (!hasView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const { data, error, count } = await supabase
      .from('quick_action_rules')
      .select('*', { count: 'exact' })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    return NextResponse.json({
      rules: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[attention-bar/admin/rules GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await assertPermission(profile.is_super_admin === true);
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      rule_name,
      description,
      page,
      role,
      when_clause,
      action_template,
      priority = 0,
      is_active = true,
      institution_id = null,
    } = body;

    if (!rule_name || !page || !role || !when_clause || !action_template) {
      return NextResponse.json(
        { error: 'Missing required fields: rule_name, page, role, when_clause, action_template' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('quick_action_rules')
      .insert({
        rule_name,
        description,
        page,
        role,
        when_clause,
        action_template,
        priority,
        is_active,
        institution_id,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    console.error('[attention-bar/admin/rules POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
