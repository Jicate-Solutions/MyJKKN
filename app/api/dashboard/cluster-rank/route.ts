import { NextResponse } from 'next/server';
import { getClusterRankPublic } from '@/lib/services/dashboard/cluster-rank-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getClusterRankPublic();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/dashboard/cluster-rank] error:', err);
    return NextResponse.json(
      {
        leaderboard: [],
        caller_institution_id: null,
        caller_rank: null,
        caller_score: null,
        refreshed_at: null,
        forbidden: true,
        reason: 'server_error'
      },
      { status: 200 } // 200 with forbidden:true is the canonical "unauthorized" shape
    );
  }
}
