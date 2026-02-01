import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { updateProcessDefinitionSchema } from '@/lib/validations/process-excellence';

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
        { error: 'Process definition ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('process_definitions')
      .select(
        `
        *,
        institution:institutions(id, name)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Process definition not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/definitions/[id]] GET error:', error);
      throw new Error(`Failed to fetch process definition: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/definitions/[id]] GET Error:', error);
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
        { error: 'Process definition ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = updateProcessDefinitionSchema.parse(json);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('process_definitions')
      .update({
        ...validatedData,
        updated_by: session.user.id
      })
      .eq('id', id)
      .select(
        `
        *,
        institution:institutions(id, name)
      `
      )
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Process definition not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/definitions/[id]] PATCH error:', error);
      throw new Error(`Failed to update process definition: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/definitions/[id]] PATCH Error:', error);

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
        { error: 'Process definition ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from('process_definitions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[process-excellence/definitions/[id]] DELETE error:', error);
      throw new Error(`Failed to delete process definition: ${error.message}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[process-excellence/definitions/[id]] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
