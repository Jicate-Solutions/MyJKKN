import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Latest health event
  const { data: latest } = await supabase
    .from('telephony_health_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Recent events (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('telephony_health_events')
    .select('id, status_type, connectivity_status, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  // Check if we should show a warning
  const isHealthy = !latest || latest.status_type === 'OK';
  const lastIssue = recent?.find((e: any) => e.status_type !== 'OK');

  return NextResponse.json({
    status: isHealthy ? 'healthy' : latest?.status_type?.toLowerCase(),
    latest,
    recent: recent || [],
    lastIssueAt: lastIssue?.created_at ?? null,
  });
}
