// POST /api/hr/disciplinary/cases/[id]/advance — advance stage
// Body: { description }
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HRDisciplinaryService } from '@/lib/services/hr/disciplinary-service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    description?: string;
  };
  const description = (body.description ?? '').trim();
  if (description.length < 5) {
    return NextResponse.json(
      { error: 'description must be at least 5 characters' },
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = new HRDisciplinaryService(supabase);
  try {
    const updated = await service.advanceStage(id, description, user.id);
    return NextResponse.json({ ok: true, case: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
