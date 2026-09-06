/**
 * POST /api/pde/clinical-reasoning/mark-image-tag
 *
 * Server-side scoring for image_tag questions. The answer key (expected_regions)
 * is never shipped to the learner's browser — fn_pde_get_case_questions strips
 * it, and this route reads it via the service-role client after verifying the
 * caller may attempt the case. Returns only the region score + matched label.
 *
 * Body: { question_id: uuid, click_point: { x, y, imgWidth, imgHeight } }
 * Reply: { region_score: number, matched_label?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface ClickPoint {
  x: number;
  y: number;
  imgWidth: number;
  imgHeight: number;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  tolerance_px?: number;
}

// Ported verbatim from the former client-side localFallbackScore so scoring is
// unchanged, only relocated server-side. Regions are FRACTIONS of the natural
// image dimensions; the click arrives in natural pixels.
function scoreRegions(
  pt: ClickPoint,
  regions: Region[] | null | undefined,
): { score: number; matched_label?: string } {
  if (!regions || regions.length === 0) {
    // No expected regions defined → award full credit (faculty must define).
    return { score: 100 };
  }
  let best = 0;
  let matched: string | undefined;
  for (const r of regions) {
    const rw = r.w * pt.imgWidth;
    const rh = r.h * pt.imgHeight;
    const cx = r.x * pt.imgWidth + rw / 2;
    const cy = r.y * pt.imgHeight + rh / 2;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tol = r.tolerance_px ?? Math.max(rw, rh) / 2;
    const s = Math.max(0, Math.min(100, (1 - dist / (tol * 2)) * 100));
    if (s > best) {
      best = s;
      matched = r.label;
    }
  }
  return { score: Math.round(best), matched_label: matched };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { question_id?: unknown; click_point?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const questionId = typeof body.question_id === 'string' ? body.question_id : '';
  const cp = body.click_point as Partial<ClickPoint> | undefined;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId) ||
    !cp ||
    !isFiniteNumber(cp.x) ||
    !isFiniteNumber(cp.y) ||
    !isFiniteNumber(cp.imgWidth) ||
    !isFiniteNumber(cp.imgHeight) ||
    cp.imgWidth <= 0 ||
    cp.imgHeight <= 0
  ) {
    return NextResponse.json({ error: 'Invalid question_id or click_point' }, { status: 400 });
  }

  // Read the key with elevated rights (learners no longer have base-table SELECT).
  const svc = createServiceRoleClient();
  const { data: question } = await svc
    .from('pde_assessment_questions')
    .select('id, assessment_id, question_type, expected_regions')
    .eq('id', questionId)
    .maybeSingle();
  if (!question || question.question_type !== 'image_tag') {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  // Authorize: the caller must be able to attempt this case (creator, or the
  // case is published+active and the caller is enrolled in its course).
  const { data: assess } = await svc
    .from('pde_assessments')
    .select('id, course_id, status, is_active, created_by')
    .eq('id', question.assessment_id)
    .maybeSingle();
  if (!assess) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  let allowed = assess.created_by === user.id;
  if (!allowed && assess.status === 'published' && assess.is_active) {
    const { data: enr } = await svc
      .from('vac_enrollments')
      .select('user_id')
      .eq('course_id', assess.course_id)
      .eq('user_id', user.id)
      .maybeSingle();
    allowed = !!enr;
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Not authorized for this case' }, { status: 403 });
  }

  const regions = (question.expected_regions ?? null) as Region[] | null;
  const result = scoreRegions(cp as ClickPoint, regions);
  return NextResponse.json({
    region_score: result.score,
    matched_label: result.matched_label ?? null,
  });
}
