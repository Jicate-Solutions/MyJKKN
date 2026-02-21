import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { updateWasteIncidentSchema } from '@/lib/validations/process-excellence';

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
        { error: 'Waste incident ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('waste_incidents')
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        process_instance:process_instances(id, current_stage, sla_status),
        reporter:profiles!waste_incidents_reported_by_fkey(id, full_name, email),
        institution:institutions(id, name)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Waste incident not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/waste/[id]] GET error:', error);
      throw new Error(`Failed to fetch waste incident: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/waste/[id]] GET Error:', error);
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
        { error: 'Waste incident ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = updateWasteIncidentSchema.parse(json);

    const supabase = await createClient();

    const updateData: Record<string, unknown> = { ...validatedData };

    // If resolving, set resolved_at and resolved_by
    if (validatedData.status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      updateData.resolved_by = session.user.id;
    }

    const { data, error } = await supabase
      .from('waste_incidents')
      .update(updateData)
      .eq('id', id)
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        reporter:profiles!waste_incidents_reported_by_fkey(id, full_name, email),
        institution:institutions(id, name)
      `
      )
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Waste incident not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/waste/[id]] PATCH error:', error);
      throw new Error(`Failed to update waste incident: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/waste/[id]] PATCH Error:', error);

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
        { error: 'Waste incident ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('waste_incidents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[process-excellence/waste/[id]] DELETE error:', error);
      throw new Error(`Failed to delete waste incident: ${error.message}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[process-excellence/waste/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
