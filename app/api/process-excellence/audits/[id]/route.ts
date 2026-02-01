import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { updateProcessAuditSchema } from '@/lib/validations/process-excellence';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process audit ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('process_audits')
      .select(
        `
        *,
        process:process_definitions(id, name, category, stages, sla_hours, target_value_add_ratio),
        auditor:users_profiles!process_audits_auditor_id_fkey(id, first_name, last_name),
        institution:institutions(id, name)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Process audit not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/audits/[id]] GET error:', error);
      throw new Error(`Failed to fetch process audit: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/audits/[id]] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process audit ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = updateProcessAuditSchema.parse(json);

    const supabase = await createClient();

    const updateData: Record<string, unknown> = { ...validatedData };

    // If finalizing, set finalized_at
    if (validatedData.status === 'finalized') {
      updateData.finalized_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('process_audits')
      .update(updateData)
      .eq('id', id)
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        auditor:users_profiles!process_audits_auditor_id_fkey(id, first_name, last_name),
        institution:institutions(id, name)
      `
      )
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Process audit not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/audits/[id]] PATCH error:', error);
      throw new Error(`Failed to update process audit: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/audits/[id]] PATCH Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process audit ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('process_audits')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[process-excellence/audits/[id]] DELETE error:', error);
      throw new Error(`Failed to delete process audit: ${error.message}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[process-excellence/audits/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
