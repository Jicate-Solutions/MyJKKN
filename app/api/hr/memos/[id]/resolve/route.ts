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
    resolution_note?: string;
    counts_toward_termination?: boolean;
  };
  const note = (body.resolution_note ?? '').trim();
  if (note.length < 5) {
    return NextResponse.json(
      { error: 'resolution_note must be at least 5 characters' },
      { status: 400 },
    );
  }
  const counts =
    typeof body.counts_toward_termination === 'boolean'
      ? body.counts_toward_termination
      : true;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Must be super_admin to resolve
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = new HRMemoService(supabase);
  try {
    const updated = await service.resolve(id, user.id, note, counts);
    return NextResponse.json({ ok: true, memo: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
