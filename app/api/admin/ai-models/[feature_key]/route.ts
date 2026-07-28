export const dynamic = 'force-dynamic';

// /api/admin/ai-models/[feature_key]
// PATCH — update model selection for one feature, OR set a model for the first
// time on a registry job that never had an ai_model_config row (UNIFICATION
// follow-up 2026-07-23: first-time governance for the model-less jobs shown on
// the unified console). Writes an audit-log row either way, then mirrors the
// model into the ai_job_types registry (the resolver's source of truth).
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
import {
  invalidateModelCache,
  type AiModelConfigRow,
} from '@/lib/services/platform/ai-model-config-service';
import { isSafetyJudge, isBelowSonnet } from '@/lib/constants/ai-safety-judge';

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

    // UNIFICATION follow-up (2026-07-23): FIRST-TIME GOVERNANCE. A registry job
    // with no ai_model_config row yet (model-less on the unified console) is
    // governed for the first time here — we CREATE the row instead of 404ing,
    // then mirror the model into the registry (below). Thereafter it behaves
    // exactly like any other governed job: audited, editable, mirrored. A
    // first-time set REQUIRES both provider and model_id (the edit dialog always
    // sends them; guard server-side for any direct API caller).
    const isCreate = !existing;
    if (
      isCreate &&
      (typeof updates.provider !== 'string' ||
        !updates.provider ||
        typeof updates.model_id !== 'string' ||
        !updates.model_id)
    ) {
      return NextResponse.json(
        { error: 'Setting a model for the first time needs both a provider and a model_id.' },
        { status: 400 },
      );
    }

    // Safety-judge FLOOR (defense in depth — the dialog also hides sub-floor
    // models): a safety-critical judge must never be set below Sonnet. Guard
    // the effective model whenever this PATCH touches the provider or model.
    if (isSafetyJudge(feature_key) && ('provider' in updates || 'model_id' in updates)) {
      const effectiveProvider = ('provider' in updates ? updates.provider : existing?.provider) as string;
      const effectiveModelId = ('model_id' in updates ? updates.model_id : existing?.model_id) as string;
      if (isBelowSonnet(effectiveProvider, effectiveModelId)) {
        return NextResponse.json(
          { error: 'Safety-judge jobs cannot be set below Sonnet.' },
          { status: 400 },
        );
      }
    }

    updates.updated_by = auth.userId;
    updates.change_reason = change_reason;

    let updated: AiModelConfigRow;
    if (isCreate) {
      // ai_model_config requires a display_name (NOT NULL) — borrow it (and a
      // description) from the registry job so the new row reads well on the
      // console. is_active / config_json fall to their DB defaults (true / null).
      const { data: regJob } = await auth.supabase
        .from('ai_job_types')
        .select('title, description')
        .eq('job_type', feature_key)
        .maybeSingle();
      const { data, error: insertErr } = await auth.supabase
        .from('ai_model_config')
        .insert({
          feature_key,
          display_name: (regJob?.title as string) || feature_key,
          description: (regJob?.description as string | null) ?? null,
          category: feature_key.includes('.') ? feature_key.split('.')[0] : 'other',
          ...updates,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      updated = data as AiModelConfigRow;
    } else {
      const { data, error: updateErr } = await auth.supabase
        .from('ai_model_config')
        .update(updates)
        .eq('feature_key', feature_key)
        .select()
        .single();
      if (updateErr) throw updateErr;
      updated = data as AiModelConfigRow;
    }

    // Audit log — a first-time set always audits; otherwise only when provider,
    // model_id, or config_json actually changed. (existing is null on create.)
    const providerChanged =
      isCreate || ('provider' in updates && updates.provider !== existing?.provider);
    const modelChanged =
      isCreate || ('model_id' in updates && updates.model_id !== existing?.model_id);
    const configChanged =
      'config_json' in updates &&
      JSON.stringify(updates.config_json ?? null) !== JSON.stringify(existing?.config_json ?? null);

    if (providerChanged || modelChanged || configChanged) {
      const { error: auditErr } = await auth.supabase.from('ai_model_config_audit').insert({
        feature_key,
        old_provider: existing?.provider ?? null,
        old_model_id: existing?.model_id ?? null,
        new_provider: updated.provider,
        new_model_id: updated.model_id,
        old_config_json: existing?.config_json ?? null,
        new_config_json: updated.config_json,
        change_reason,
        changed_by: auth.userId,
      });

      if (auditErr) {
        // Don't fail the request — config write already succeeded. Log loudly.
        console.error('[ai-models] audit insert failed (config still updated):', auditErr);
      }
    }

    // ── CONFIG MERGE (2026-07-14) ──────────────────────────────────────────
    // Mirror the resolved model into the ai_job_types registry, which is now
    // the resolver's source of truth (getModelForFeature reads the registry
    // first). Without this mirror a model swap here would update
    // ai_model_config but the resolver would keep reading the stale registry
    // value. When the feature is deactivated (is_active=false) we clear the
    // registry model so resolution falls through to the hardcoded fallback —
    // exact parity with the pre-merge behavior where an inactive
    // ai_model_config row resolved to the hardcoded default. Non-fatal: the
    // ai_model_config write already succeeded; log loudly on failure.
    const active = updated.is_active !== false;
    const { error: mirrorErr } = await auth.supabase.rpc('fn_ai_job_type_set_model', {
      p_job_type: feature_key,
      p_provider: active ? updated.provider : null,
      p_model_id: active ? updated.model_id : null,
      p_fallback_provider: active ? updated.fallback_provider : null,
      p_fallback_model_id: active ? updated.fallback_model_id : null,
      p_monthly_spend_cap_inr: updated.monthly_spend_cap_inr ?? null,
    });
    if (mirrorErr) {
      console.error(
        `[ai-models] registry mirror failed for ${feature_key} (ai_model_config updated; resolver may read stale until next sync):`,
        mirrorErr.message,
      );
    }

    // Invalidate the in-memory cache so next consumer call sees new selection
    invalidateModelCache(feature_key);

    // The ai_model_config write above already committed — we do NOT undo it
    // (there is nothing to roll back to that would be more correct) and the
    // response below still carries the saved row. But ai_job_types is the
    // resolver's actual source of truth (see CONFIG MERGE comment above), so
    // a plain 200 here would tell the admin "saved" while the two tables
    // silently drift apart — exactly the failure mode this route exists to
    // prevent. 502 (Bad Gateway), not 200-with-a-warning-field: the only
    // caller today (ai-model-edit-dialog.tsx) treats any 2xx as full success
    // via `if (!res.ok)`, so a 200 would be swallowed and shown as a plain
    // success toast regardless of what extra fields we added to the body. A
    // non-2xx status makes the existing caller surface `error` verbatim with
    // zero client-side changes.
    if (mirrorErr) {
      return NextResponse.json(
        {
          error: `Model config saved, but the ai_job_types registry mirror failed — the resolver may keep using the old model until this is retried: ${mirrorErr.message}`,
          data: updated,
          mirrored: false,
          mirrorError: mirrorErr.message,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[ai-models/[feature_key]] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update AI model config' }, { status: 500 });
  }
}
