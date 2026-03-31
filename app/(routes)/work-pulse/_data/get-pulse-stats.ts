import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { PulseStats } from '@/types/work-pulse';

export async function getPulseStats(): Promise<PulseStats | null> {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) return null;
  return WorkPulseService.getMyPulseStats(profile.id);
}
