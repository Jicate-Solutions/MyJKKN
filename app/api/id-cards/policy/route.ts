export const dynamic = 'force-dynamic';

// /api/id-cards/policy
// Phase 1C — read + write the id-card subsystem policy.
//
// GET   ?institution_id=<uuid>  — any authenticated user. Calls fn_get_id_card_policy
//                                  (Agent A's reader fn) and returns the resolved policy.
// PATCH                          — super_admin only. Body: { updates: [{ key, value }] }.
//                                  Allowlist of 11 known id_card.* keys; rejects others.
//                                  Writes via service-role client (RLS bypass for admin pane).
//
// Envelope: { data: ... } on success, { error: { message, code } } on failure.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireUser } from '@/lib/id-cards/auth';
import { ID_CARD_POLICY_KEYS, type IdCardPolicy, type IdCardPolicyKey } from '@/lib/id-cards/types';

const getQuerySchema = z.object({
  institution_id: z.string().uuid()
});

const patchBodySchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.string(),
        value: z.unknown()
      })
    )
    .min(1, 'updates must contain at least one entry')
    .max(50, 'updates capped at 50 entries per request')
});

const ALLOWED_KEY_SET = new Set<string>(ID_CARD_POLICY_KEYS);

export async function GET(request: NextRequest) {
  await connection();
  try {
    // Any authenticated user may read policy. We DON'T check role here — the policy is
    // institution-scoped reference data needed by many downstream UIs.
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonError('Unauthorized: sign-in required', 'unauthenticated', 401);
    }

    const url = new URL(request.url);
    const parsed = getQuerySchema.safeParse({
      institution_id: url.searchParams.get('institution_id')
    });
    if (!parsed.success) {
      return jsonError(
        `Invalid query params: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        'bad_request',
        400
      );
    }

    const { data, error } = await supabase.rpc('fn_get_id_card_policy', {
      p_institution_id: parsed.data.institution_id
    });

    if (error) {
      console.error('[id-cards/policy] GET rpc error:', error);
      return jsonError(
        `Failed to load id-card policy: ${error.message}`,
        'rpc_failed',
        500
      );
    }

    return jsonOk<IdCardPolicy>(data as IdCardPolicy);
  } catch (err) {
    console.error('[id-cards/policy] GET unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}

export async function PATCH(request: NextRequest) {
  await connection();
  try {
    const auth = await requireUser(['super_admin']);
    if (!auth.ok) return jsonError(auth.message, 'forbidden', auth.status);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 'bad_request', 400);
    }

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        'bad_request',
        400
      );
    }

    // Reject any key not in the allowlist before doing any writes.
    const offending = parsed.data.updates.find((u) => !ALLOWED_KEY_SET.has(u.key));
    if (offending) {
      return jsonError(
        `Key "${offending.key}" is not in the id_card policy allowlist. Allowed: ${ID_CARD_POLICY_KEYS.join(', ')}`,
        'forbidden_key',
        400
      );
    }

    // Use service role for the write — admin-pane mutation bypasses RLS by design.
    const service = createServiceRoleClient();

    let updated = 0;
    for (const update of parsed.data.updates) {
      const { error: upsertError } = await service
        .from('platform_policies')
        .upsert(
          {
            key: update.key as IdCardPolicyKey,
            value: update.value as never,
            updated_by: auth.userId,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'key' }
        );
      if (upsertError) {
        console.error('[id-cards/policy] PATCH upsert error:', { key: update.key, error: upsertError });
        return jsonError(
          `Failed to upsert key "${update.key}": ${upsertError.message}`,
          'upsert_failed',
          500
        );
      }
      updated += 1;
    }

    return jsonOk({ updated });
  } catch (err) {
    console.error('[id-cards/policy] PATCH unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
