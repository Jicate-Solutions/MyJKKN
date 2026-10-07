export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/playbooks/lines/retire — the HR head takes a playbook line
 * off its duty screen. Body: { id, note } (both required). The line is kept, marked
 * retired, with who retired it and why; its author stays credited in history.
 * The line id rides in the body, not an [id] segment: a static path costs
 * nothing against the Vercel route budget (scripts/ci/check-route-budget.sh).
 *
 * fn_hr_playbook_retire_line enforces the hr.harness.playbooks.manage key.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PlaybookError, playbookService } from '@/lib/services/hr/playbooks/playbook-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { id?: unknown; note?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown line.' }, { status: 400 });

    const note = typeof body?.note === 'string' ? body.note : '';
    const lineId = await playbookService.retireLine(supabase, id, note);
    return NextResponse.json({ id: lineId });
  } catch (err) {
    if (err instanceof PlaybookError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[api/hr/playbooks/retire] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
