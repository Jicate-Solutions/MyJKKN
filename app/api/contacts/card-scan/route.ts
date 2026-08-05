/**
 * Business-card scanner — upload + enqueue on the ₹0 Max lane.
 *
 * Spec: specs/card-scanner-max-lane-handoff-2026-08-05.md
 *
 * POST  — accept a card photo, stage it in the private `card-scans` bucket, and
 *         enqueue `contacts.card_extract`. Returns { job_id } IMMEDIATELY and
 *         never waits for the model: the fair flow is snap-snap-snap, ten cards
 *         a minute, reviewed later over chai (Director decision 13).
 * GET    — status + extracted fields for the review queue.
 *
 * The photo never rides in the AI payload. It goes to storage; the Windows
 * Max-lane runner downloads it to a sandbox and reads it off disk with
 * `claude -p --allowedTools Read` — the mechanism proven by the procurement-PDF
 * spec. That is what keeps this on the ₹0 subscription lane instead of the paid
 * API (Director instruction, 2026-08-05: OCR runs on Max like every other feature).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'card-scans';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a phone photo of a 9x5cm card is ~1-3 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

/** Extension for the stored object; the runner always reads it as an image. */
function extFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  return 'jpg';
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('photo');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'photo is required' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported image type "${file.type || 'unknown'}". Use JPEG, PNG, WEBP or HEIC.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `That photo is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB.` },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // The event/place this card was collected at. Optional, free text — it lands
  // in Networker's `introduced_by`, which already carries exactly this ("EPSI
  // event", "NED 2026 delegate list"), and is what powers filter-by-event
  // (Director decision 14).
  const eventLabel = String(form.get('event') ?? '').trim().slice(0, 120) || null;

  const admin = createServiceRoleClient();

  // ── Dedupe on the bytes themselves ────────────────────────────────────────
  // The same card photographed twice (a double-tap at a busy stall, or a retry
  // after the queue drained) must not become two jobs and two contacts. An
  // identical sha256 from the same user returns the ORIGINAL job — the review
  // queue then shows one card, not two.
  const { data: prior } = await admin
    .from('ai_jobs')
    .select('id, status')
    .eq('job_type', 'contacts.card_extract')
    .eq('requested_by', user.id)
    .contains('payload', { sha256 })
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior?.id) {
    return NextResponse.json({ ok: true, job_id: prior.id, status: prior.status, duplicate: true });
  }

  // ── Stage the photo ───────────────────────────────────────────────────────
  // Path is content-addressed so a re-upload of identical bytes overwrites
  // itself rather than littering the bucket.
  const month = new Date().toISOString().slice(0, 7);
  const storagePath = `${user.id}/${month}/${sha256}.${extFor(file.type)}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });

  if (upErr) {
    console.error('[card-scan] upload failed:', upErr.message);
    return NextResponse.json({ ok: false, error: 'Could not store the photo.' }, { status: 500 });
  }

  // ── Enqueue on the session client ─────────────────────────────────────────
  // Deliberately NOT the service client: fn_ai_enqueue enforces the job type's
  // allow_rule and per-user daily cap as the CALLER. Enqueuing as service-role
  // would bypass both.
  const { data: enq, error: enqErr } = await supabase.rpc('fn_ai_enqueue', {
    p_job_type: 'contacts.card_extract',
    p_payload: {
      storage_path: storagePath,
      sha256,
      scanned_by: user.email ?? null,
      event: eventLabel,
    },
  });

  if (enqErr || !enq?.ok || typeof enq?.job_id !== 'string') {
    const errText = typeof enq?.error === 'string' ? enq.error : (enqErr?.message ?? '');
    // Leave the stored photo in place: the bytes are content-addressed, so a
    // retry reuses the same object instead of orphaning a second copy.
    if (errText === 'unknown or disabled job_type') {
      return NextResponse.json(
        { ok: false, error: 'Card scanning is currently switched off.' },
        { status: 503 },
      );
    }
    if (errText === 'daily limit reached') {
      return NextResponse.json(
        { ok: false, error: 'You have reached today’s scanning limit.', cap: enq?.cap, used: enq?.used },
        { status: 429 },
      );
    }
    console.error('[card-scan] enqueue failed:', errText);
    return NextResponse.json({ ok: false, error: 'Could not queue the card for reading.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: enq.job_id, status: 'queued', duplicate: false });
}

/**
 * GET ?job_id=…   — one card's status/result
 * GET (no params) — this user's pending review queue (newest first, decision 14)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const jobId = request.nextUrl.searchParams.get('job_id');

  // requested_by is always pinned to the caller: a scan queue is personal until
  // the contact is saved and its sharing switch is set (decision 8).
  let query = admin
    .from('ai_jobs')
    .select('id, status, result, error, payload, requested_at, completed_at')
    .eq('job_type', 'contacts.card_extract')
    .eq('requested_by', user.id);

  if (jobId) query = query.eq('id', jobId);
  else query = query.order('requested_at', { ascending: false }).limit(50);

  const { data, error } = await query;
  if (error) {
    console.error('[card-scan] read failed:', error.message);
    return NextResponse.json({ ok: false, error: 'Could not read the scan queue.' }, { status: 500 });
  }

  const rows = (data ?? []).map((j) => ({
    job_id: j.id,
    status: j.status,
    // The runner writes { fields, raw }; only `fields` is meant for the UI.
    fields: (j.result as { fields?: Record<string, unknown> } | null)?.fields ?? null,
    error: j.error,
    event: (j.payload as { event?: string | null } | null)?.event ?? null,
    storage_path: (j.payload as { storage_path?: string } | null)?.storage_path ?? null,
    requested_at: j.requested_at,
    completed_at: j.completed_at,
  }));

  return NextResponse.json(jobId ? { ok: true, scan: rows[0] ?? null } : { ok: true, scans: rows });
}
