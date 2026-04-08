

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/assessments/[id] — get assessment with questions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: assessment, error: aErr } = await (supabase as any)
      .from('pde_assessments')
      .select('*')
      .eq('id', id)
      .single();

    if (aErr || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const { data: questions, error: qErr } = await (supabase as any)
      .from('pde_assessment_questions')
      .select('*')
      .eq('assessment_id', id)
      .order('order_index');

    if (qErr) throw qErr;

    return NextResponse.json({
      data: { ...assessment, questions: questions || [] },
    });
  } catch (error: any) {
    console.error('Error fetching assessment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/pde/assessments/[id] — update assessment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const { data, error } = await (supabase as any)
      .from('pde_assessments')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error updating assessment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/pde/assessments/[id] — soft delete (set is_active = false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await (supabase as any)
      .from('pde_assessments')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ message: 'Assessment deleted' });
  } catch (error: any) {
    console.error('Error deleting assessment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
