export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/playbooks/decide — the HR head accepts or declines a
 * proposed playbook line.
 *
 * Body: { id, decision: 'accept' | 'decline', edited_text?: string, note?: string }
 * The proposal id rides in the body, not an [id] segment: a static path costs
 * nothing against the Vercel route budget (scripts/ci/check-route-budget.sh).
 *
 * fn_hr_playbook_decide enforces: the hr.harness.playbooks.manage key (or super
 * admin); the proposal must still be waiting; nobody decides their own
 * suggestion; a decline needs a note. Accepting credits the team member who
 * suggested the line, or — for a line drafted from repeated reasons — the
 * person accepting it.
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

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown; decision?: unknown; edited_text?: unknown; note?: unknown }
      | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown proposal.' }, { status: 400 });

    if (!body || (body.decision !== 'accept' && body.decision !== 'decline')) {
      return NextResponse.json({ error: "decision must be 'accept' or 'decline'." }, { status: 400 });
    }
    const resultId = await playbookService.decide(supabase, id, {
      decision: body.decision,
      edited_text: typeof body.edited_text === 'string' ? body.edited_text : null,
      note: typeof body.note === 'string' ? body.note : null,
    });
    return NextResponse.json({ id: resultId });
  } catch (err) {
    if (err instanceof PlaybookError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[api/hr/playbooks/decide] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
