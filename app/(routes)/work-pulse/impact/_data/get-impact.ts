import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { ImpactSummary, WpAgentImpact } from '@/types/work-pulse';

export async function getImpactData(): Promise<{
  summary: ImpactSummary;
  agents: WpAgentImpact[];
}> {
  const [summary, agents] = await Promise.all([
    WorkPulseService.getImpactSummary(),
    WorkPulseService.getImpactList(),
  ]);
  return { summary, agents };
}
