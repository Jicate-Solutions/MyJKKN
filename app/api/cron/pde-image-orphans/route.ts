// app/api/cron/pde-image-orphans/route.ts
// ============================================================================
// Deletes clinical images that no case refers to any more.
//
// Why a sweeper and not "delete when the case is deleted": PDE cases are never
// hard-deleted. DELETE /api/pde/cases/[id] sets status='archived' and keeps the
// row, because past learner submissions stay pinned to the version they took
// and an archive can be reversed. Deleting imagery on archive would therefore
// destroy images still legitimately referenced. So the rule is reference-based
// rather than event-based: an object survives while some case points at it.
//
// This also catches the larger everyday source of orphans — images imported or
// uploaded while authoring a case that was then abandoned, which no delete hook
// would ever have seen.
//
// A grace period protects the in-flight case: an image is only removed once it
// has been unreferenced for longer than someone could plausibly be mid-edit.
//
// Decision: Director, 2026-07-21 ("delete the images too").
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'pde-clinical-images';
const GRACE_HOURS = 48;
const MAX_DELETES_PER_RUN = 200; // bounded blast radius; the rest wait for the next run

function pathFromPublicUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const p = url.slice(at + marker.length).split('?')[0];
  return p || null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry-run support: prove what WOULD be deleted before trusting the sweep.
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';

  const admin = createServiceRoleClient();

  try {
    // 1. Every path any case currently points at — scenario images and
    //    per-question media, across ALL statuses including archived. An
    //    archived case is not a deleted case; its imagery stays.
    const referenced = new Set<string>();

    const { data: lessons, error: lessonErr } = await (admin as any)
      .from('vac_lessons')
      .select('case_scenario')
      .not('case_scenario', 'is', null);
    if (lessonErr) throw lessonErr;
    for (const row of lessons ?? []) {
      const p = pathFromPublicUrl(row?.case_scenario?.image_url);
      if (p) referenced.add(p);
    }

    const { data: questions, error: qErr } = await (admin as any)
      .from('pde_assessment_questions')
      .select('question_media_url')
      .not('question_media_url', 'is', null);
    if (qErr) throw qErr;
    for (const row of questions ?? []) {
      const p = pathFromPublicUrl(row?.question_media_url);
      if (p) referenced.add(p);
    }

    // 2. Walk the bucket. Objects live at {casesheet_id}/{image_id}.jpg for PMS
    //    imports and manual/{user_id}/{uuid}.jpg for uploads, so enumerate one
    //    level of folders and list inside each.
    const cutoff = Date.now() - GRACE_HOURS * 60 * 60 * 1000;
    const orphans: string[] = [];
    let scanned = 0;

    const listFolder = async (prefix: string): Promise<void> => {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      for (const entry of data ?? []) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        // A storage "folder" comes back with no id/metadata — descend into it.
        if (!entry.id) {
          await listFolder(full);
          continue;
        }
        scanned++;
        if (referenced.has(full)) continue;
        const created = entry.created_at ? new Date(entry.created_at).getTime() : 0;
        if (created && created > cutoff) continue; // still inside the grace window
        if (orphans.length < MAX_DELETES_PER_RUN) orphans.push(full);
      }
    };

    await listFolder('');

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        scanned,
        referenced: referenced.size,
        would_delete: orphans.length,
        sample: orphans.slice(0, 10),
      });
    }

    let deleted = 0;
    if (orphans.length > 0) {
      const { error: delErr } = await admin.storage.from(BUCKET).remove(orphans);
      if (delErr) throw delErr;
      deleted = orphans.length;
    }

    return NextResponse.json({
      ok: true,
      scanned,
      referenced: referenced.size,
      deleted,
      capped: orphans.length >= MAX_DELETES_PER_RUN,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/pde-image-orphans] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
