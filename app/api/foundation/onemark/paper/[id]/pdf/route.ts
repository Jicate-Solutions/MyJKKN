export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadPaperModel } from '@/lib/onemark/pdf/load-paper';
import { GlyphCoverageError } from '@/lib/onemark/pdf/notation';
import { renderAnswerKeyPdf, renderQuestionPaperPdf } from '@/lib/onemark/pdf/render';
import { PAPER_SERIES, type PaperSeries } from '@/lib/onemark/pdf/types';

// OneMark — GET /api/foundation/onemark/paper/[id]/pdf?series=A&key=1
//
//   series  A–D (decision 16). Default A = the Senior Learner's own order.
//   key     "1" streams the SEPARATE answer-key PDF for that series (PRD §5.3);
//           anything else streams the question paper, which never contains an
//           answer — load-paper.ts strips answers unless key was asked for.
//
// Gate: foundation.assessments.manage, checked by the single-argument
// user_has_permission RPC (resolves against auth.uid(), carries the super-admin
// bypass and multi-role OR-merging). A caller without it gets an explicit 403
// with a reason, never a silent redirect (CLAUDE.md #27).
//
// The PDF is streamed with Cache-Control: no-store and is never written to a
// bucket — an answer key must not outlive the request on any shared surface.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: allowed } = await (supabase as any).rpc('user_has_permission', {
      permission_name: 'foundation.assessments.manage',
    });
    if (allowed !== true) {
      return NextResponse.json(
        { error: 'You do not have access to build OneMark papers. Ask your Foundation coordinator for foundation.assessments.manage.' },
        { status: 403 },
      );
    }

    const seriesParam = (request.nextUrl.searchParams.get('series') ?? 'A').toUpperCase();
    if (!PAPER_SERIES.includes(seriesParam as PaperSeries)) {
      return NextResponse.json({ error: 'series must be one of A, B, C, D' }, { status: 400 });
    }
    const series = seriesParam as PaperSeries;
    const wantKey = request.nextUrl.searchParams.get('key') === '1';

    const model = await loadPaperModel(id, { includeAnswers: wantKey });
    if (!model) {
      // loadPaperModel returns null when RLS hides the row or it has no items.
      // No finalisation state is checked here: fp_assessments.config carries
      // no state machine on main today (Lane W owns that); when it lands the
      // gate belongs in loadPaperModel, and this message must say so.
      return NextResponse.json({ error: 'Paper not found, has no questions, or not permitted' }, { status: 404 });
    }

    const rendered = wantKey ? await renderAnswerKeyPdf(model, series) : await renderQuestionPaperPdf(model, series);

    return new NextResponse(new Uint8Array(rendered.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${rendered.filename}"`,
        'Cache-Control': 'no-store, private, max-age=0',
      },
    });
  } catch (err: any) {
    if (err instanceof GlyphCoverageError) {
      // A character no embedded font can print. Explicit, item by item, so the
      // Senior Learner can reword it (decision 14) — never a box in the hall.
      // Only item ids and the glyphs themselves are returned, no item text.
      return NextResponse.json(
        { error: 'The paper contains characters the embedded fonts cannot print. Reword the items listed.', gaps: err.gaps },
        { status: 422 },
      );
    }
    // The detail (raw PostgREST text can name tables and columns) goes to the
    // log only; the caller gets a fixed string. This is the answer-key route.
    console.error('[onemark/paper/pdf] GET error:', err);
    return NextResponse.json({ error: 'Could not render the paper' }, { status: 500 });
  }
}
