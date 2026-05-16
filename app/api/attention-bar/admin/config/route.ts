/**
 * GET/PATCH /api/attention-bar/admin/config
 *
 * Tab 1 — Per-layer kill switches (5 toggles). Tab 5 — Layer 4 budget edits.
 * Body for PATCH: { key: string, value: unknown }
 *
 * Allowed keys (allowlist — cannot write arbitrary config). See
 * lib/attention-bar/layer-enabled-config.ts for the resolver-side reader.
 *
 * Auth: super_admin OR attention_bar.config.manage
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { invalidateLayerEnabledCache } from '@/lib/attention-bar/layer-enabled-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LAYER_ENABLED_KEYS = new Set([
  'layer_0.enabled',
  'layer_1.enabled',
  'layer_2.enabled',
  'layer_3.enabled',
  'layer_4.enabled',
]);

const ALLOWED_CONFIG_KEYS = new Set([
  // Per-layer kill switches (Tab 1 panel)
  ...LAYER_ENABLED_KEYS,
  // Layer 4 AI-specific (Tab 5 panel)
  'layer_4.daily_budget_usd',
  'layer_4.per_user_daily_calls',
  'layer_4.cache_ttl_minutes',
  // Layer 3 behavioral-learning thresholds
  'layer_3.min_impressions',
  'layer_3.confidence_threshold',
  // Layer 0 misc
  'layer_0.queue_pip_visible_at',
]);

export async function GET() {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  const supabase = await createClient();

  if (!isSuperAdmin) {
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      permission_name: 'attention_bar.config.manage',
    });
    if (!hasPerm) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('quick_action_config')
    .select('key, value, updated_at')
    .in('key', [...ALLOWED_CONFIG_KEYS]);

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ config: data ?? [] });
}

export async function PATCH(request: Request) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  const supabase = await createClient();

  if (!isSuperAdmin) {
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      permission_name: 'attention_bar.config.manage',
    });
    if (!hasPerm) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || !ALLOWED_CONFIG_KEYS.has(key)) {
      return NextResponse.json(
        { error: `Invalid config key. Allowed: ${[...ALLOWED_CONFIG_KEYS].join(', ')}` },
        { status: 400 },
      );
    }

    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('quick_action_config')
      .upsert(
        { key, value, updated_at: new Date().toISOString(), updated_by: profile.id },
        { onConflict: 'key' },
      )
      .select()
      .single();

    if (error) throw error;

    // Layer kill-switch flips: invalidate the cached enabled-layers map so
    // the next /resolve call picks up the new value immediately (without
    // waiting 60s for the TTL to expire on the same Lambda instance).
    if (LAYER_ENABLED_KEYS.has(key)) {
      invalidateLayerEnabledCache();
    }

    return NextResponse.json({ config: data });
  } catch (err) {
    console.error('[attention-bar/admin/config PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
