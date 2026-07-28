export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRMemoService } from '@/lib/services/hr/memo-service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    dispute_text?: string;
  };
  const disputeText = (body.dispute_text ?? '').trim();
  if (disputeText.length < 10) {
    return NextResponse.json(
      { error: 'dispute_text must be at least 10 characters' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: memo } = await supabase
    .from('hr_memos')
    .select('id, staff_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!memo) {
    return NextResponse.json({ error: 'Memo not found' }, { status: 404 });
  }
  if (memo.status === 'resolved') {
    return NextResponse.json(
      { error: 'Cannot dispute a resolved memo' },
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
    const updated = await service.dispute(id, user.id, disputeText);
    return NextResponse.json({ ok: true, memo: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
