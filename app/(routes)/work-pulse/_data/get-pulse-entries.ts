import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { PulseEntryFilters, WpPulseEntry } from '@/types/work-pulse';

export async function getPulseEntries(
  filters: PulseEntryFilters = {}
): Promise<{ data: WpPulseEntry[]; total: number }> {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) return { data: [], total: 0 };
  return WorkPulseService.getMyPulseEntries(profile.id, filters);
}
