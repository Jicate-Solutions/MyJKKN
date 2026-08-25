// app/api/admin/orchestration/sync/route.ts
//
// POST /api/admin/orchestration/sync
// Refreshes orchestration_prs and writes a heartbeat row into
// orchestration_session_state. Two ways rows get in, and either or both may
// be used in one call:
//
//   1. Push-based (primary path): the caller (the tower session, or any
//      script with a super-admin's session) sends `{ prs: [...] }` in the
//      JSON body. Those rows are upserted on `number`.
//   2. Best-effort `gh pr list` shell-out: if no `prs` array is given, this
//      route TRIES to shell out to the `gh` CLI server-side. Vercel's Node
//      serverless functions do not ship the `gh` binary or its auth, so this
//      is expected to no-op there — it exists for local/self-hosted runs
//      where `gh` is on PATH and authenticated. Failure here is silent and
//      reported in the response, never a 500.
//
// A heartbeat is always upserted into orchestration_session_state, keyed by
// `session.session_id` (defaults to a generic 'web-sync' id if omitted) —
// this is what powers the page's "updated Xm ago" freshness stamp.
//
// RBAC: super_admin only — same gate as every other orchestration route.
// This route only writes rows; it never merges or deploys anything.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface IncomingPrRow {
  number: number;
  module_key?: string | null;
  title?: string | null;
  mergeable?: string | null;
  ci_state?: string | null;
  ci_checked_at?: string | null;
  gate_state?: string | null;
  is_draft?: boolean | null;
}

interface SyncRequestBody {
  prs?: IncomingPrRow[];
  session?: {
    session_id?: string;
    name?: string;
    current_activity?: string;
  };
}

function sanitizePrRows(rows: unknown): IncomingPrRow[] {
  if (!Array.isArray(rows)) return [];
  const out: IncomingPrRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const number = Number(r.number);
    if (!Number.isFinite(number) || number <= 0) continue;
    out.push({
      number,
      module_key: typeof r.module_key === 'string' ? r.module_key : null,
      title: typeof r.title === 'string' ? r.title : null,
      mergeable: typeof r.mergeable === 'string' ? r.mergeable : null,
      ci_state: typeof r.ci_state === 'string' ? r.ci_state : null,
      ci_checked_at: typeof r.ci_checked_at === 'string' ? r.ci_checked_at : null,
      gate_state: typeof r.gate_state === 'string' ? r.gate_state : null,
      is_draft: typeof r.is_draft === 'boolean' ? r.is_draft : null,
    });
  }
  return out;
}

// Best-effort `gh pr list` — never throws. Returns [] if `gh` isn't
// available (the normal case on Vercel) or the call fails for any reason.
async function tryGhPrList(): Promise<{ rows: IncomingPrRow[]; error: string | null }> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,mergeable,isDraft'],
      { timeout: 20_000 },
    );
    const parsed = JSON.parse(stdout) as Array<{
      number: number;
      title: string;
      mergeable: string;
      isDraft: boolean;
    }>;
    return {
      rows: parsed.map((p) => ({
        number: p.number,
        title: p.title ?? null,
        mergeable: p.mergeable ?? null,
        is_draft: p.isDraft ?? null,
      })),
      error: null,
    };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : 'gh pr list failed' };
  }
}

export async function POST(request: NextRequest) {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
  if (!isSuper) {
    return NextResponse.json({ ok: false, error: 'Forbidden: super_admin only' }, { status: 403 });
  }

  let body: SyncRequestBody = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw) as SyncRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  let prRows = sanitizePrRows(body.prs);
  let ghAttempted = false;
  let ghError: string | null = null;

  if (prRows.length === 0) {
    ghAttempted = true;
    const gh = await tryGhPrList();
    prRows = gh.rows;
    ghError = gh.error;
  }

  let prsUpserted = 0;
  if (prRows.length > 0) {
    const { error } = await supabase
      .from('orchestration_prs')
      .upsert(
        prRows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: 'number' },
      );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    prsUpserted = prRows.length;
  }

  const sessionId = body.session?.session_id?.trim() || 'web-sync';
  const { error: sessionError } = await supabase.from('orchestration_session_state').upsert(
    {
      session_id: sessionId,
      name: body.session?.name ?? null,
      current_activity: body.session?.current_activity ?? 'sync',
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' },
  );
  if (sessionError) {
    return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    prsUpserted,
    sessionHeartbeat: sessionId,
    ghAttempted,
    ghError,
  });
}
