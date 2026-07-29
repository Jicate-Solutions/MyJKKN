import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/reports/composition?compositionId= ──────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const compositionId = searchParams.get('compositionId');

    if (!compositionId) {
      return NextResponse.json({ error: 'compositionId is required' }, { status: 400 });
    }

    // Read-only observer: holds the reports view grant but sits on no board —
    // may READ any institution's composition report. Service-role bypasses the
    // board-scoped RLS that would otherwise 404 this caller. VIEW ONLY.
    const scope = await resolveBosBoardScope(user.id);
    const canReadAllBos = isBosReadAllObserver(
      scope,
      await hasBosPermission(user.id, 'academic.bos-reports.view')
    );
    const db = canReadAllBos ? createServiceRoleClient() : supabase;

    const [{ data: composition, error: compErr }, { data: members, error: memErr }] =
      await Promise.all([
        db
          .from('bos_compositions')
          .select('*')
          .eq('id', compositionId)
          .single(),
        db
          .from('bos_members')
          .select('*')
          .eq('composition_id', compositionId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('member_type', { ascending: true }),
      ]);

    if (compErr) throw compErr;
    if (memErr) throw memErr;
    if (!composition) return NextResponse.json({ error: 'Composition not found' }, { status: 404 });

    // Resolve board name from COE API
    let board = null;
    if (composition.board_id && composition.institutions_id) {
      const { fetchCoeBoardMap } = await import('@/lib/utils/bos/coe-boards');
      const boardMap = await fetchCoeBoardMap(composition.institutions_id);
      board = boardMap.get(composition.board_id) ?? null;
    }

    return NextResponse.json({ composition: { ...composition, board }, members: members ?? [] });
  } catch (error) {
    console.error('[bos/reports/composition] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch composition report' }, { status: 500 });
  }
}
