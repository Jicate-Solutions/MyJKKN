export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UUID_RE, isMissingObject, sourceGate } from '../../_shared';
import { canRemoveHit, type BoardPaperHit } from '@/lib/services/onemark/sources-board-paper';

// OneMark — un-tick one board-paper match.
//
// DELETE /api/foundation/onemark/sources/board-paper/<hitId>
//
// The record is APPEND-ONLY: there is no PATCH here on purpose. A tick that
// turns out to be wrong is REMOVED by the person who made it, and then made
// again if they still mean it. Editing would let a row be nudged until it
// agreed with a story; a delete-and-retick leaves the audit trail an honest
// correction should leave.
//
// Only the AUTHOR may remove their own tick — a question author who did not
// make it is refused, deliberately, with the reason said out loud.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ hitId: string }> },
) {
  await connection();
  try {
    const { hitId } = await params;
    if (!UUID_RE.test(hitId)) {
      return NextResponse.json({ error: 'hitId must be a uuid' }, { status: 400 });
    }

    const supabase = await createClient();
    const gate = await sourceGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!gate.canManage) {
      return NextResponse.json(
        { error: 'Only a question author can change the board-paper record.' },
        { status: 403 },
      );
    }

    const { data: hit, error: readError } = await supabase
      .from('onemark_board_paper_hits')
      .select('id, exam_definition_id, exam_year, sitting, item_id, match_kind, board_qno, note, noted_by, noted_at')
      .eq('id', hitId)
      .maybeSingle();

    if (readError) {
      if (isMissingObject(readError)) {
        return NextResponse.json(
          { error: 'Recording board-paper matches is not switched on yet.' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: readError.message }, { status: 400 });
    }
    if (!hit) return NextResponse.json({ error: 'That record no longer exists.' }, { status: 404 });

    if (!canRemoveHit(hit as unknown as BoardPaperHit, gate.userId)) {
      return NextResponse.json(
        {
          error:
            'Only the person who recorded this match can remove it. Ask them, or record your own reading of the paper alongside it.',
        },
        { status: 403 },
      );
    }

    const { error } = await supabase.from('onemark_board_paper_hits').delete().eq('id', hitId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ removed: hitId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The record could not be removed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
