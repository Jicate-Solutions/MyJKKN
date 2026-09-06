// ============================================================================
// MENTOR SIGNAL SYNC — nightly federation of "mentees met" from the mentor app
// ============================================================================
// The mentor app is a SEPARATE Supabase project ("Mentor module-Roja"). We do
// NOT migrate it — we federate: read its counseling data, compute how many
// distinct mentees each mentor has actually MET (>=1 counseling session), map
// mentor -> email -> MyJKKN profile, and upsert a per-profile count into
// mentor_signal_snapshot. That snapshot backs the faculty.mentees_met OKR
// metric (calc_faculty_mentees_met) used in the faculty appraisal.
//
// "MET" = distinct counseling_sessions.student_id per mentor. Assigned-but-
// never-met does not count. mentors.user_id -> users.email -> profiles.email.
// An email can map to >1 MyJKKN profile, so the dedup (DISTINCT ON email,
// prefer active + faculty) lives in the service_role-only RPC
// fn_mentor_signal_sync_upsert — this route just delivers the raw {email,met}.
//
// CREDENTIAL: needs the mentor project's read credentials in the environment:
//   MENTOR_SUPABASE_URL, MENTOR_SUPABASE_SERVICE_ROLE_KEY
// Until BOTH are set this route is a safe no-op (HTTP 200, skipped), so it can
// ship and be scheduled inert, then activate the moment the creds are added.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Pattern mirrors /api/cron/scf-note-judge (auth + service-role client).
// Created: 2026-07-22.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';

const LOG_PREFIX = '[mentor-signal-sync]';
const PAGE = 1000; // Supabase JS max rows per request

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(`${LOG_PREFIX} CRON_SECRET not configured`);
    return false;
  }
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = request.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const mentorUrl = process.env.MENTOR_SUPABASE_URL;
  const mentorKey = process.env.MENTOR_SUPABASE_SERVICE_ROLE_KEY;
  if (!mentorUrl || !mentorKey) {
    // Inert until the mentor read-credentials are provisioned. Not an error:
    // the scheduled job simply reports it did nothing this run.
    console.warn(`${LOG_PREFIX} mentor credentials not configured — skipping`);
    return NextResponse.json({
      ok: true,
      skipped: 'mentor credentials not configured (set MENTOR_SUPABASE_URL + MENTOR_SUPABASE_SERVICE_ROLE_KEY)',
    });
  }

  const started = Date.now();
  try {
    const mentor = createClient(mentorUrl, mentorKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch every row of a mentor-app table (paged). Closes over `mentor` so
    // there is no cross-generic client type to annotate.
    const fetchAll = async (
      table: string,
      columns: string,
    ): Promise<Record<string, unknown>[]> => {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await mentor
          .from(table)
          .select(columns)
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`read ${table}: ${error.message}`);
        const batch = (data ?? []) as Record<string, unknown>[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      return rows;
    };

    // Read the three tables and join in Node (no dependency on PostgREST embeds
    // or on adding anything to the mentor DB — pure read).
    const [mentors, users, sessions] = await Promise.all([
      fetchAll('mentors', 'id, user_id'),
      fetchAll('users', 'id, email'),
      fetchAll('counseling_sessions', 'mentor_id, student_id'),
    ]);

    const emailByUser = new Map<string, string>();
    for (const u of users) {
      const id = u.id as string | null;
      const email = (u.email as string | null)?.trim().toLowerCase();
      if (id && email) emailByUser.set(id, email);
    }
    const emailByMentor = new Map<string, string>();
    for (const m of mentors) {
      const id = m.id as string | null;
      const email = emailByUser.get((m.user_id as string) ?? '');
      if (id && email) emailByMentor.set(id, email);
    }

    // distinct met students per mentor email
    const metByEmail = new Map<string, Set<string>>();
    for (const s of sessions) {
      const email = emailByMentor.get((s.mentor_id as string) ?? '');
      const student = s.student_id as string | null;
      if (!email || !student) continue;
      let set = metByEmail.get(email);
      if (!set) {
        set = new Set<string>();
        metByEmail.set(email, set);
      }
      set.add(student);
    }

    const rows = Array.from(metByEmail.entries()).map(([email, set]) => ({
      email,
      met: set.size,
    }));

    // Hand the raw counts to the service_role-only RPC, which resolves each
    // email to ONE MyJKKN profile (dedup) and upserts the snapshot.
    const admin = createServiceRoleClient();
    const { data: upserted, error } = await admin.rpc('fn_mentor_signal_sync_upsert', {
      p_rows: rows,
    });
    if (error) throw new Error(`upsert: ${error.message}`);

    return NextResponse.json({
      ok: true,
      mentors: mentors.length,
      sessions: sessions.length,
      emails_with_met: rows.length,
      profiles_upserted: upserted ?? 0,
      ms: Date.now() - started,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 },
    );
  }
}
