export const dynamic = 'force-dynamic';

// /api/admin/ai-models/[feature_key]
// PATCH — update model selection for one feature. Writes audit log row.
//
// Body:
//   {
//     provider?: string;
//     model_id?: string;
//     fallback_provider?: string | null;
//     fallback_model_id?: string | null;
//     monthly_spend_cap_inr?: number | null;
//     is_active?: boolean;
//     config_json?: object | null;
//     change_reason: string;  // REQUIRED — captured in audit log
//   }
//
// RBAC: super_admin only.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invalidateModelCache } from '@/lib/services/platform/ai-model-config-service';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'super_admin') return { ok: false as const, status: 403 };
  return { ok: true as const, supabase, userId: user.id };
}

type RouteContext = { params: Promise<{ feature_key: string }> };

const MUTABLE_FIELDS = [
  'provider',
  'model_id',
  'fallback_provider',
  'fallback_model_id',
  'monthly_spend_cap_inr',
  'is_active',
  'config_json',
] as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { feature_key } = await context.params;

    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const body = await request.json();
    const { change_reason } = body;

    if (!change_reason || typeof change_reason !== 'string' || change_reason.trim().length < 3) {
      return NextResponse.json(
        { error: 'change_reason is required (at least 3 characters) — every model swap is audited.' },
        { status: 400 },
      );
    }

    // Build updates object — only allow mutable fields
    const updates: Record<string, unknown> = {};
    for (const field of MUTABLE_FIELDS) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: `No updatable fields provided. You can update: ${MUTABLE_FIELDS.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Validate provider if changing
    if ('provider' in updates) {
      if (typeof updates.provider !== 'string' || updates.provider.length === 0) {
        return NextResponse.json({ error: 'provider must be a non-empty string' }, { status: 400 });
      }
    }
    if ('model_id' in updates) {
      if (typeof updates.model_id !== 'string' || updates.model_id.length === 0) {
        return NextResponse.json({ error: 'model_id must be a non-empty string' }, { status: 400 });
      }
    }

    // Read existing row for audit log diff
    const { data: existing, error: readErr } = await auth.supabase
      .from('ai_model_config')
      .select('feature_key, provider, model_id, config_json')
      .eq('feature_key', feature_key)
      .maybeSingle();

    if (readErr) throw readErr;
    if (!existing) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
    }

    updates.updated_by = auth.userId;
    updates.change_reason = change_reason;

    const { data: updated, error: updateErr } = await auth.supabase
      .from('ai_model_config')
      .update(updates)
      .eq('feature_key', feature_key)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Audit log — only if provider, model_id, or config_json actually changed
    const providerChanged =
      'provider' in updates && updates.provider !== existing.provider;
    const modelChanged =
      'model_id' in updates && updates.model_id !== existing.model_id;
    const configChanged =
      'config_json' in updates &&
      JSON.stringify(updates.config_json ?? null) !== JSON.stringify(existing.config_json ?? null);

    if (providerChanged || modelChanged || configChanged) {
      const { error: auditErr } = await auth.supabase.from('ai_model_config_audit').insert({
        feature_key,
        old_provider: existing.provider,
        old_model_id: existing.model_id,
        new_provider: updated.provider,
        new_model_id: updated.model_id,
        old_config_json: existing.config_json,
        new_config_json: updated.config_json,
        change_reason,
        changed_by: auth.userId,
      });

      if (auditErr) {
        // Don't fail the request — config write already succeeded. Log loudly.
        console.error('[ai-models] audit insert failed (config still updated):', auditErr);
      }
    }

    // Invalidate the in-memory cache so next consumer call sees new selection
    invalidateModelCache(feature_key);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[ai-models/[feature_key]] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update AI model config' }, { status: 500 });
  }
}
