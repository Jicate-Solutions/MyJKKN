import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import type { WasteCategory, ProcessMetrics } from '@/types/process-excellence';

const querySchema = z.object({
  institution_id: z.string().uuid('Institution ID is required')
});

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const validatedParams = querySchema.parse({ institution_id: institutionId });

    const supabase = await createClient();

    // Get process definitions count
    const { count: totalProcesses } = await supabase
      .from('process_definitions')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', validatedParams.institution_id)
      .eq('is_active', true);

    // Get all instances for this institution's processes
    const { data: allInstances } = await supabase
      .from('process_instances')
      .select(
        `
        sla_status,
        completed_at,
        value_add_ratio,
        total_cycle_hours,
        process:process_definitions!inner(institution_id)
      `
      );

    const institutionInstances =
      allInstances?.filter(
        (i: any) => i.process?.institution_id === validatedParams.institution_id
      ) || [];

    const activeInstances = institutionInstances.filter(
      (i: any) => i.completed_at === null
    );
    const completedInstances = institutionInstances.filter(
      (i: any) => i.completed_at !== null
    );

    // Calculate SLA compliance
    const slaCompliance =
      completedInstances.length > 0
        ? (completedInstances.filter((i: any) => i.sla_status !== 'breached').length /
            completedInstances.length) *
          100
        : 100;

    // Calculate average value-add ratio
    const avgValueAdd =
      completedInstances.length > 0
        ? completedInstances.reduce(
            (sum: number, i: any) => sum + (i.value_add_ratio || 0),
            0
          ) / completedInstances.length
        : 0;

    // Get waste incidents
    const { count: totalWaste } = await supabase
      .from('waste_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', validatedParams.institution_id);

    const { count: openWaste } = await supabase
      .from('waste_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', validatedParams.institution_id)
      .eq('status', 'open');

    // Get waste breakdown
    const { data: wasteBreakdown } = await supabase
      .from('waste_incidents')
      .select('waste_category, estimated_time_lost_hours, estimated_cost_impact')
      .eq('institution_id', validatedParams.institution_id);

    const wasteByCategory = new Map<
      WasteCategory,
      { count: number; total_hours_lost: number; total_cost_impact: number }
    >();

    const WASTE_LABELS: Record<WasteCategory, string> = {
      T: 'Transportation',
      I: 'Inventory',
      M: 'Motion',
      W: 'Waiting',
      O1: 'Over-production',
      O2: 'Over-processing',
      D: 'Defects',
      TU: 'Talent Under-utilization'
    };

    (wasteBreakdown || []).forEach((w: any) => {
      const cat = w.waste_category as WasteCategory;
      if (!wasteByCategory.has(cat)) {
        wasteByCategory.set(cat, {
          count: 0,
          total_hours_lost: 0,
          total_cost_impact: 0
        });
      }
      const data = wasteByCategory.get(cat)!;
      data.count++;
      data.total_hours_lost += w.estimated_time_lost_hours || 0;
      data.total_cost_impact += w.estimated_cost_impact || 0;
    });

    // Get SLA distribution
    const slaDistribution = {
      on_track: activeInstances.filter((i: any) => i.sla_status === 'on_track').length,
      at_risk: activeInstances.filter((i: any) => i.sla_status === 'at_risk').length,
      breached: activeInstances.filter((i: any) => i.sla_status === 'breached').length
    };

    // Get recent audits
    const { data: recentAudits } = await supabase
      .from('process_audits')
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email)
      `
      )
      .eq('institution_id', validatedParams.institution_id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get process metrics
    const { data: processesData } = await supabase
      .from('process_definitions')
      .select('id, name, category')
      .eq('institution_id', validatedParams.institution_id)
      .eq('is_active', true);

    const processMetrics: ProcessMetrics[] = [];

    for (const process of processesData || []) {
      const processInstances = institutionInstances.filter(
        (i: any) => i.process?.id === process.id
      );
      const completedProcessInstances = processInstances.filter(
        (i: any) => i.completed_at !== null
      );

      const avgCycleTime =
        completedProcessInstances.length > 0
          ? completedProcessInstances.reduce(
              (sum: number, i: any) => sum + (i.total_cycle_hours || 0),
              0
            ) / completedProcessInstances.length
          : 0;

      const valueAddRatio =
        completedProcessInstances.length > 0
          ? completedProcessInstances.reduce(
              (sum: number, i: any) => sum + (i.value_add_ratio || 0),
              0
            ) / completedProcessInstances.length
          : 0;

      const slaComp =
        completedProcessInstances.length > 0
          ? (completedProcessInstances.filter(
              (i: any) => i.sla_status !== 'breached'
            ).length /
              completedProcessInstances.length) *
            100
          : 100;

      const wasteCount =
        wasteBreakdown?.filter((w: any) => w.process_id === process.id).length || 0;

      processMetrics.push({
        process_id: process.id,
        process_name: process.name,
        category: process.category,
        total_instances: processInstances.length,
        completed_instances: completedProcessInstances.length,
        in_progress_instances:
          processInstances.length - completedProcessInstances.length,
        avg_cycle_time: parseFloat(avgCycleTime.toFixed(2)),
        value_add_ratio: parseFloat(valueAddRatio.toFixed(2)),
        sla_compliance: parseFloat(slaComp.toFixed(2)),
        waste_count: wasteCount,
        abcd_distribution: { A: 0, B: 0, C: 0, D: 0 }
      });
    }

    return NextResponse.json({
      summary: {
        total_processes: totalProcesses || 0,
        active_instances: activeInstances.length,
        sla_compliance_rate: parseFloat(slaCompliance.toFixed(2)),
        avg_value_add_ratio: parseFloat(avgValueAdd.toFixed(2)),
        total_waste_incidents: totalWaste || 0,
        open_waste_incidents: openWaste || 0
      },
      process_metrics: processMetrics,
      waste_breakdown: Array.from(wasteByCategory.entries()).map(
        ([category, data]) => ({
          category,
          label: WASTE_LABELS[category] || category,
          ...data
        })
      ),
      sla_distribution: slaDistribution,
      recent_audits: recentAudits || [],
      trending_processes: []
    });
  } catch (error) {
    console.error('[process-excellence/dashboard] GET Error:', error);

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
