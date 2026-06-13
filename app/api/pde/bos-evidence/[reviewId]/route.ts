// =============================================================================
// app/api/pde/bos-evidence/[reviewId]/route.ts
// PDE Tier 4 — T4.3 — GET endpoint returning PDE evidence for a BoS review.
// =============================================================================
//
// Read-only. RLS enforced by:
//   - bos_course_reviews_select policy (is_super_admin OR is_admin OR
//     bos.meetings.view + institution access)
//   - pde_demonstrations RLS (institution-scoped reads)
//
// If the caller lacks access, the service returns null and we 404; we do NOT
// distinguish "not found" from "not authorized" by design (avoid leaking
// existence of cross-institution reviews).
// =============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEvidenceForReview } from '@/lib/services/pde-bos-evidence-service';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ reviewId: string }> },
) {
  await connection();
  try {
    const { reviewId } = await context.params;
    if (!reviewId) {
      return NextResponse.json(
        { error: 'reviewId required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const evidence = await getEvidenceForReview(reviewId, supabase as any);
    if (!evidence) {
      return NextResponse.json(
        { error: 'Review not found or not accessible' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: evidence });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Error fetching BoS evidence' },
      { status: 500 },
    );
  }
}
