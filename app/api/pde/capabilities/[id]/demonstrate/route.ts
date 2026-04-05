export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/capabilities/[id]/demonstrate — demonstrate a capability
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: capabilityId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { demonstration_evidence, demonstration_score } = body;

    if (!demonstration_evidence) {
      return NextResponse.json(
        { error: 'demonstration_evidence is required' },
        { status: 400 }
      );
    }

    // Upsert learner capability
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_learner_capabilities')
      .upsert(
        {
          learner_id: user.id,
          capability_id: capabilityId,
          status: 'demonstrated',
          demonstrated_at: new Date().toISOString(),
          demonstration_evidence,
          demonstration_score: demonstration_score || null,
        },
        { onConflict: 'learner_id,capability_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error demonstrating capability:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
