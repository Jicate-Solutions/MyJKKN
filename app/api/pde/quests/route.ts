export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/quests?quest_type=xxx&difficulty=xxx&status=xxx&source_type=xxx
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const questType = searchParams.get('quest_type');
    const difficulty = searchParams.get('difficulty');
    const status = searchParams.get('status');
    const sourceType = searchParams.get('source_type');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('pde_quests')
      .select('*')
      .order('created_at', { ascending: false });

    if (questType) query = query.eq('quest_type', questType);
    if (difficulty) query = query.eq('difficulty', difficulty);
    if (status) query = query.eq('status', status);
    if (sourceType) query = query.eq('source_type', sourceType);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching quests:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/pde/quests — create a new quest
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, problem_statement, quest_type, deliverable_description, ...rest } = body;

    if (!title || !description || !problem_statement || !quest_type || !deliverable_description) {
      return NextResponse.json(
        { error: 'title, description, problem_statement, quest_type, and deliverable_description are required' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_quests')
      .insert({
        title,
        description,
        problem_statement,
        quest_type,
        deliverable_description,
        created_by: user.id,
        ...rest,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error creating quest:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
