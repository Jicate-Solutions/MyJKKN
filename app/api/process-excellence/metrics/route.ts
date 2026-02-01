import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import { processMetricsFiltersSchema } from '@/lib/validations/process-excellence';
import type { ProcessMetrics, WasteCategory } from '@/types/process-excellence';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const queryParams = {
      institution_id: searchParams.get('institution_id') || '',
      process_id: searchParams.get('process_id') || undefined,
      category: searchParams.get('category') || undefined,
      period_start: searchParams.get('period_start') || undefined,
      period_end: searchParams.get('period_end') || undefined
    };

    const validatedFilters = processMetricsFiltersSchema.parse(queryParams);

    const supabase = await createClient();

    // Get completed instances with process details
    let instancesQuery = supabase
      .from('process_instances')
      .select(
        `
        *,
        process:process_definitions!inner(id, name, category, institution_id)
      `
      )
      .not('completed_at', 'is', null);

    if (validatedFilters.period_start) {
      instancesQuery = instancesQuery.gte('started_at', validatedFilters.period_start);
    }

    if (validatedFilters.period_end) {
      instancesQuery = instancesQuery.lte('started_at', validatedFilters.period_end);
    }

    const { data: instances, error: instancesError } = await instancesQuery;

    if (instancesError) {
      console.error('[process-excellence/metrics] Instances error:', instancesError);
      throw new Error(`Failed to fetch instances: ${instancesError.message}`);
    }

    // Get waste incidents
    const { data: wasteData, error: wasteError } = await supabase
      .from('waste_incidents')
      .select('process_id')
      .eq('institution_id', validatedFilters.institution_id);

    if (wasteError) {
      console.warn('[process-excellence/metrics] Waste data warning:', wasteError);
    }

    // Group by process
    const metricsMap = new Map<string, ProcessMetrics>();

    instances?.forEach((inst: any) => {
      const process = inst.process;
      if (process.institution_id !== validatedFilters.institution_id) return;
      if (validatedFilters.process_id && process.id !== validatedFilters.process_id) return;
      if (validatedFilters.category && process.category !== validatedFilters.category) return;

      if (!metricsMap.has(process.id)) {
        metricsMap.set(process.id, {
          process_id: process.id,
          process_name: process.name,
          category: process.category,
          total_instances: 0,
          completed_instances: 0,
          in_progress_instances: 0,
          avg_cycle_time: 0,
          value_add_ratio: 0,
          sla_compliance: 0,
          waste_count: 0,
          abcd_distribution: { A: 0, B: 0, C: 0, D: 0 }
        });
      }

      const metrics = metricsMap.get(process.id)!;
      metrics.total_instances++;
      metrics.completed_instances++;
      metrics.avg_cycle_time += inst.total_cycle_hours || 0;
      metrics.value_add_ratio += inst.value_add_ratio || 0;
      if (inst.sla_status !== 'breached') metrics.sla_compliance++;
    });

    // Calculate averages and add waste counts
    metricsMap.forEach((metrics, processId) => {
      if (metrics.completed_instances > 0) {
        metrics.avg_cycle_time = parseFloat(
          (metrics.avg_cycle_time / metrics.completed_instances).toFixed(2)
        );
        metrics.value_add_ratio = parseFloat(
          (metrics.value_add_ratio / metrics.completed_instances).toFixed(2)
        );
        metrics.sla_compliance = parseFloat(
          ((metrics.sla_compliance / metrics.completed_instances) * 100).toFixed(2)
        );
      }

      // Count waste incidents for this process
      metrics.waste_count =
        wasteData?.filter((w: any) => w.process_id === processId).length || 0;
    });

    return NextResponse.json(Array.from(metricsMap.values()));
  } catch (error) {
    console.error('[process-excellence/metrics] GET Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
