// app/api/cron/meeting-audio-retention/route.ts
// ============================================================================
// Meeting recordings — delete the audio once its 90 days are up.
//
// ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
// /meetings/record tells the person holding the phone: "Audio is stored
// privately and kept for 90 days, then deleted." Until this route, that
// sentence was false. `audio_delete_after` was stamped at finish, an index was
// built for the sweep, and nothing anywhere read either — the promise had
// nothing behind it. Director's decision, 16 Sep 2026: build the job rather
// than soften the sentence.
//
// What that promise is about: these recordings carry interview conversations
// (salary history, previous employers), IQAC discussions and staff
// conversations held in a room. Keeping them beyond what was promised is worse
// than never recording them, because the people in the room were told.
//
// ── WHAT IS DELETED, AND WHAT SURVIVES ──────────────────────────────────────
// Only the audio objects in the private `meeting-audio` bucket. The
// meeting_recordings row survives with its title, its length, when it happened
// and what it was attached to, so the institutional record of the meeting is
// not lost with the sound of it. The transcript, when transcription lands, is
// never deleted by this date — only the audio is.
//
// ── ONE DELIBERATE DEVIATION ────────────────────────────────────────────────
// 20260915120001's header says the sweeper "blanks chunk_count". This does not.
// chunk_count is how many pieces the meeting HAD, which stays true after the
// audio is gone, and zeroing it makes a 91-day-old meeting read as "0 pieces of
// audio" — indistinguishable on the host's screen from a recording that failed.
// `bytes_total` IS zeroed, because that is a fact about files that no longer
// exist. `audio_deleted_at` is the signal that the audio is gone.
//
// ── FAIL-SOFT, IDEMPOTENT, BOUNDED ──────────────────────────────────────────
// One recording's storage failure must not abort the sweep: every candidate is
// handled on its own, errors are collected rather than thrown, and a recording
// is only stamped after its objects were actually removed (or found to be
// none). A row already carrying audio_deleted_at is never looked at again —
// that is the query's own filter, so a re-run costs nothing. Bounded per run,
// same doctrine as cron/campus-walk-photo-retention: the rest wait for
// tomorrow rather than one giant sweep risking the function timeout.
//
// Auth: CRON_SECRET, Bearer header (Vercel sends it) or ?secret= for a manual
// run. A cron with no secret check is a public endpoint that deletes audio.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'meeting-audio';

/** Bounded blast radius per run. The rest wait for tomorrow. */
const MAX_RECORDINGS_PER_RUN = 100;

/**
 * One storage listing page. A recording chunks every 30 seconds, so 1,000
 * objects is about 8 hours of meeting — longer than any real one, but the
 * listing pages anyway rather than assuming that.
 */
const LIST_PAGE = 1000;

interface RecordingRow {
  id: string;
  recorded_by: string;
  title: string | null;
  chunk_count: number | null;
  audio_delete_after: string | null;
}

interface SweptRecording {
  id: string;
  objects_removed: number;
  due_since: string | null;
}

interface SweepError {
  id: string;
  error: string;
}

/**
 * Every object stored for one recording.
 *
 * The path shape is fixed by the chunk-url route: {recorded_by}/{id}/{index}.
 * Listing the folder rather than rebuilding paths from chunk_count on purpose —
 * a chunk that arrived after finish, or one whose index the client and server
 * disagree about, still gets deleted. A promise to delete audio must not be
 * kept only for the audio we can predict the name of.
 */
async function listRecordingObjects(
  admin: ReturnType<typeof createServiceRoleClient>,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(folder, { limit: LIST_PAGE, offset });
    if (error) throw error;
    const page = data ?? [];
    for (const entry of page) {
      if (entry?.name) paths.push(`${folder}/${entry.name}`);
    }
    if (page.length < LIST_PAGE) break;
  }
  return paths;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  // Prove what WOULD be deleted before trusting it. Nothing is removed or
  // stamped on a dry run.
  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1';

  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const swept: SweptRecording[] = [];
  const errors: SweepError[] = [];

  try {
    // The cutoff is the row's own audio_delete_after, set at finish from the
    // retention the person was promised — not recomputed here from a constant.
    // A recording finished under a different promise keeps the promise it was
    // given.
    const { data: rows, error: readErr } = await admin
      .from('meeting_recordings')
      .select('id, recorded_by, title, chunk_count, audio_delete_after')
      .not('audio_delete_after', 'is', null)
      .lt('audio_delete_after', nowIso)
      .is('audio_deleted_at', null)
      .order('audio_delete_after', { ascending: true })
      .limit(MAX_RECORDINGS_PER_RUN);
    if (readErr) throw readErr;

    const candidates = (rows ?? []) as RecordingRow[];

    for (const rec of candidates) {
      try {
        const folder = `${rec.recorded_by}/${rec.id}`;
        const paths = await listRecordingObjects(admin, folder);

        if (dryRun) {
          swept.push({
            id: rec.id,
            objects_removed: paths.length,
            due_since: rec.audio_delete_after,
          });
          continue;
        }

        if (paths.length > 0) {
          const { error: removeErr } = await admin.storage.from(BUCKET).remove(paths);
          if (removeErr) throw removeErr;
        }

        // Stamped only after the objects are actually gone. A recording whose
        // folder was already empty is still stamped: there is no audio, which
        // is what audio_deleted_at claims, and leaving it unstamped would make
        // this row a candidate on every run for ever.
        const { error: markErr } = await admin
          .from('meeting_recordings')
          .update({ audio_deleted_at: new Date().toISOString(), bytes_total: 0 })
          .eq('id', rec.id);
        if (markErr) throw markErr;

        swept.push({
          id: rec.id,
          objects_removed: paths.length,
          due_since: rec.audio_delete_after,
        });
      } catch (e) {
        // One recording's failure must not abort the sweep. Not stamped, so it
        // is retried tomorrow rather than silently left with its audio.
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[cron/meeting-audio-retention] recording ${rec.id} failed:`, message);
        errors.push({ id: rec.id, error: message });
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      cutoff: nowIso,
      candidates: candidates.length,
      swept: swept.length,
      swept_detail: swept,
      objects_removed: swept.reduce((n, s) => n + s.objects_removed, 0),
      errors: errors.length,
      error_detail: errors,
      capped: candidates.length >= MAX_RECORDINGS_PER_RUN,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/meeting-audio-retention] sweep failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
