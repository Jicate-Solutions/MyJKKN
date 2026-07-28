// app/api/mba/dept-artifacts/collect/route.ts
// POST — drain completed draft jobs off the ₹0 Max lane and persist them.
// The UI polls this after clicking "Draft with AI". Idempotent and area-agnostic
// (it claims any completed draft job); safe for any board participant to trigger.

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { collectAndPersistDrafts } from '@/lib/services/mba-dept-artifacts/collect-drafts';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canView } = await supabase.rpc('user_has_permission', {
      permission_name: 'improvement.ideas.view',
    });
    if (canView !== true) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const admin = createServiceRoleClient();
    const outcome = await collectAndPersistDrafts(admin);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    console.error('[POST /api/mba/dept-artifacts/collect] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
