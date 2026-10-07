export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/playbooks/lines/[id]/retire — the HR head takes a playbook line
 * off its duty screen. Body: { note } (required). The line is kept, marked
 * retired, with who retired it and why; its author stays credited in history.
 *
 * fn_hr_playbook_retire_line enforces the hr.harness.playbooks.manage key.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PlaybookError, playbookService } from '@/lib/services/hr/playbooks/playbook-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown line.' }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === 'string' ? body.note : '';
    const lineId = await playbookService.retireLine(supabase, id, note);
    return NextResponse.json({ id: lineId });
  } catch (err) {
    if (err instanceof PlaybookError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[api/hr/playbooks/retire] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
