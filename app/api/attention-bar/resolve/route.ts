/**
 * GET /api/attention-bar/resolve?page=/admission/leads
 *
 * Verification endpoint for Phase 1 — drives the resolver from the user's
 * authenticated session and returns the resolved action.
 *
 * Phase 4 (Layer 2 rules engine) reuses this same endpoint to power the
 * Test Sandbox in /system/attention-bar tab 7.
 *
 * Optional query params (test-only, gated to super_admin):
 *  - role:     override the role for resolution (super_admin only)
 *  - layer3:   'on' | 'off' to override consent (super_admin only)
 *  - layers:   comma-separated layer numbers to enable (super_admin only)
 */

import { NextResponse } from 'next/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { buildContext, resolve } from '@/lib/attention-bar/resolver';
import type { Layer } from '@/lib/attention-bar/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_LAYERS: ReadonlySet<Layer> = new Set([0, 1, 2, 3, 4] as Layer[]);

function parseLayers(raw: string | null): Layer[] {
  if (!raw) return [];
  const out: Layer[] = [];
  for (const tok of raw.split(',')) {
    const n = Number(tok.trim());
    if (Number.isInteger(n) && (VALID_LAYERS as Set<number>).has(n)) {
      out.push(n as Layer);
    }
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page');

  if (!page) {
    return NextResponse.json(
      { error: 'Missing required query param: page' },
      { status: 400 },
    );
  }

  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const isSuperAdmin = profile.is_super_admin === true;

  const roleOverride = url.searchParams.get('role');
  const layer3Override = url.searchParams.get('layer3');
  const layersOverride = url.searchParams.get('layers');

  if (!isSuperAdmin && (roleOverride || layer3Override || layersOverride)) {
    return NextResponse.json(
      { error: 'Override params require super_admin' },
      { status: 403 },
    );
  }

  const role = roleOverride ?? (profile.role ?? 'guest');
  const layer3Consent = layer3Override === 'on';
  // Phase 1 default: 'off' or omitted both mean false (opt-in not yet collected).

  const ctx = buildContext({
    userId: profile.id,
    role,
    page,
    layer3Consent,
    enabledLayers: parseLayers(layersOverride),
  });

  const resolved = await resolve(ctx);

  return NextResponse.json({
    page,
    role,
    resolved,
  });
}
