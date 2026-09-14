export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SOURCE_COLUMNS, sourceGate } from '../_shared';
import {
  DELETE_REFUSED_MESSAGE,
  isInvalid,
  validateSourceUpdate,
  type OneMarkSourceRow,
} from '@/lib/services/onemark/sources-service';

// OneMark — one question source.
//
// PATCH  /api/foundation/onemark/sources/<key>  -> { label?, description?, sort_order?, is_active? }
// DELETE /api/foundation/onemark/sources/<key>  -> 405, always
//
// The KEY is not patchable and saying so is the point: it is what every
// question from this source stores in `fp_items.source_key`, so a rename would
// orphan them. A patch carrying a different key is refused with that sentence
// rather than ignored, so nobody walks away believing a rename happened.
//
// A BUILT-IN source cannot be switched off: the ingestion script writes
// `past_board_exam` and the drafting job writes `internal`, both by name.
// Renaming those is fine — the label is what people read, the key is what code
// writes.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  await connection();
  try {
    const { key } = await params;
    const supabase = await createClient();
    const gate = await sourceGate(supabase);
    if (!gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!gate.canManage) {
      return NextResponse.json(
        { error: 'Only a question author can change a question source.' },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
    }

    const { data: current, error: readError } = await supabase
      .from('onemark_item_sources')
      .select(SOURCE_COLUMNS)
      .eq('key', key)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    if (!current) {
      return NextResponse.json({ error: 'That source no longer exists.' }, { status: 404 });
    }

    const checked = validateSourceUpdate(current as unknown as OneMarkSourceRow, body);
    if (isInvalid(checked)) return NextResponse.json({ error: checked.error }, { status: 400 });

    const reason =
      checked.value.is_active === false
        ? 'Retired from the OneMark sources screen'
        : checked.value.is_active === true
          ? 'Brought back from the OneMark sources screen'
          : 'Edited on the OneMark sources screen';

    const { data, error } = await supabase
      .from('onemark_item_sources')
      .update({ ...checked.value, updated_by: gate.userId, change_reason: reason })
      .eq('key', key)
      .select(SOURCE_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ source: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The source could not be changed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  await connection();
  return NextResponse.json({ error: DELETE_REFUSED_MESSAGE }, { status: 405 });
}
