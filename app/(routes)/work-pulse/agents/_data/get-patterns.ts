import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { PatternFilters, WpPattern, AgentBoardStats } from '@/types/work-pulse';

export async function getPatterns(
  filters: PatternFilters = {}
): Promise<{ data: WpPattern[]; total: number }> {
  return WorkPulseService.getPatterns(filters);
}

export async function getAgentBoardStats(): Promise<AgentBoardStats> {
  return WorkPulseService.getAgentBoardStats();
}
