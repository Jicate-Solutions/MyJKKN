import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { advanceStageSchema } from '@/lib/validations/process-excellence';
import type { StageHistory, ProcessDefinition, SLAStatus } from '@/types/process-excellence';

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
        { error: 'Process instance ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('process_instances')
      .select(
        `
        *,
        process:process_definitions(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Process instance not found' },
          { status: 404 }
        );
      }
      console.error('[process-excellence/instances/[id]] GET error:', error);
      throw new Error(`Failed to fetch process instance: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/instances/[id]] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Advance stage
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process instance ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = advanceStageSchema.parse(json);

    const supabase = await createClient();

    // Get current instance
    const { data: instance, error: fetchError } = await supabase
      .from('process_instances')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !instance) {
      return NextResponse.json(
        { error: 'Process instance not found' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const history = (instance.stage_history as StageHistory[]) || [];

    // Close current stage
    const lastStage = history[history.length - 1];
    if (lastStage && !lastStage.completed_at) {
      lastStage.completed_at = now;
      lastStage.duration_hours =
        (new Date(now).getTime() - new Date(lastStage.started_at).getTime()) /
        (1000 * 60 * 60);
    }

    // Add new stage
    history.push({
      stage: validatedData.new_stage,
      started_at: now,
      completed_at: null,
      duration_hours: null,
      is_value_add: validatedData.is_value_add
    });

    const { data, error } = await supabase
      .from('process_instances')
      .update({
        current_stage: validatedData.new_stage,
        stage_history: history
      })
      .eq('id', id)
      .select(
        `
        *,
        process:process_definitions(*)
      `
      )
      .single();

    if (error) {
      console.error('[process-excellence/instances/[id]] PATCH error:', error);
      throw new Error(`Failed to advance stage: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/instances/[id]] PATCH Error:', error);

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

// Complete process
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Process instance ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current instance with process details
    const { data: instance, error: fetchError } = await supabase
      .from('process_instances')
      .select('*, process:process_definitions(*)')
      .eq('id', id)
      .single();

    if (fetchError || !instance) {
      return NextResponse.json(
        { error: 'Process instance not found' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const history = (instance.stage_history as StageHistory[]) || [];
    const process = instance.process as ProcessDefinition;

    // Close final stage
    const lastStage = history[history.length - 1];
    if (lastStage && !lastStage.completed_at) {
      lastStage.completed_at = now;
      lastStage.duration_hours =
        (new Date(now).getTime() - new Date(lastStage.started_at).getTime()) /
        (1000 * 60 * 60);
    }

    // Calculate metrics
    const totalHours = history.reduce(
      (sum, s) => sum + (s.duration_hours || 0),
      0
    );

    // Get value-add stages from process definition
    const valueAddStageNames = (process?.stages || [])
      .filter((s) => s.is_value_add)
      .map((s) => s.name);

    const valueAddHours = history
      .filter(
        (s) => valueAddStageNames.includes(s.stage) || s.is_value_add === true
      )
      .reduce((sum, s) => sum + (s.duration_hours || 0), 0);

    const valueAddRatio =
      totalHours > 0 ? (valueAddHours / totalHours) * 100 : 0;

    // Check SLA
    let slaStatus: SLAStatus = 'on_track';
    if (process?.sla_hours) {
      if (totalHours > process.sla_hours) {
        slaStatus = 'breached';
      } else if (totalHours > process.sla_hours * 0.8) {
        slaStatus = 'at_risk';
      }
    }

    const { data, error } = await supabase
      .from('process_instances')
      .update({
        completed_at: now,
        current_stage: 'completed',
        stage_history: history,
        total_cycle_hours: parseFloat(totalHours.toFixed(2)),
        value_add_hours: parseFloat(valueAddHours.toFixed(2)),
        value_add_ratio: parseFloat(valueAddRatio.toFixed(2)),
        sla_status: slaStatus
      })
      .eq('id', id)
      .select(
        `
        *,
        process:process_definitions(*)
      `
      )
      .single();

    if (error) {
      console.error('[process-excellence/instances/[id]] PUT error:', error);
      throw new Error(`Failed to complete process: ${error.message}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[process-excellence/instances/[id]] PUT Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
