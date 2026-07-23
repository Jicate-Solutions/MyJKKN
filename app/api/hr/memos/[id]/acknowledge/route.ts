export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRMemoService } from '@/lib/services/hr/memo-service';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the memo belongs to a staff record this user owns
  const { data: memo } = await supabase
    .from('hr_memos')
    .select('id, staff_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!memo) {
    return NextResponse.json({ error: 'Memo not found' }, { status: 404 });
  }
  if (memo.status !== 'issued') {
    return NextResponse.json(
      { error: `Memo cannot be acknowledged from status "${memo.status}"` },
      { status: 400 },
    );
  }

  const { data: staffRow } = await supabase
    .from('staff')
    .select('id')
    .eq('profile_id', user.id)
    .eq('id', memo.staff_id)
    .maybeSingle();
  if (!staffRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = new HRMemoService(supabase);
  try {
    const updated = await service.acknowledge(id, user.id);
    return NextResponse.json({ ok: true, memo: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
