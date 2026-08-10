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

  // ── Authorize BEFORE any bytes are persisted ──────────────────────────────
  // fn_ai_enqueue holds the real gate, but it runs AFTER the upload — so a
  // caller who fails it had already had their photo written to the private
  // bucket, and the sha256 dedupe only sees ENQUEUED jobs, so those orphans
  // accumulate unreferenced. Check the same permission up front; the enqueue
  // remains the authoritative check, this is just refusing to store first.
  const { data: mayScan } = await supabase.rpc('user_has_permission', {
    permission_name: 'meetings.contacts.scan',
  });
  if (mayScan === false) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'You do not have access to card scanning yet. Ask an administrator to grant the “Scan Business Cards” permission.',
        code: 'not_allowed',
      },
      { status: 403 },
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
    // An access denial must SAY it is an access denial (CLAUDE.md rule #27).
    // Before this branch existed the caller got a generic 500 "Could not queue
    // the card for reading", which reads as a broken feature rather than a
    // closed door — proven live 2026-08-05, when the Director's own account hit
    // exactly that 500 because the job type's allow_rule admits one user.
    if (errText === 'not allowed for this job_type') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'You do not have access to card scanning yet. Ask an administrator to grant the “Scan Business Cards” permission.',
          code: 'not_allowed',
        },
        { status: 403 },
      );
    }
    // In-flight ceiling (max_inflight on the job type). This is NOT a failure of
    // the scan — the photo is stored and the card can be re-submitted the moment
    // a slot frees. The capture screen must retry rather than lose the card
    // (decision 21: never block scanning, losing the card is the worst outcome).
    if (errText === 'too many in-flight jobs of this type') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Still reading your last few cards — this one will go through in a moment.',
          code: 'busy',
          retryable: true,
        },
        { status: 429 },
      );
    }
    // The partial unique index (migration 20260811090200) makes the sha256
    // dedupe atomic, so the loser of a genuine race lands here rather than
    // creating a second job. That is the dedupe WORKING — return the job the
    // winner created, exactly as the SELECT above would have.
    if (/duplicate key|unique constraint|23505/i.test(errText)) {
      const { data: raced } = await admin
        .from('ai_jobs')
        .select('id, status')
        .eq('job_type', 'contacts.card_extract')
        .eq('requested_by', user.id)
        .contains('payload', { sha256 })
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (raced?.id) {
        return NextResponse.json({
          ok: true,
          job_id: raced.id,
          status: raced.status,
          duplicate: true,
        });
      }
    }
    console.error('[card-scan] enqueue failed:', errText);
    return NextResponse.json({ ok: false, error: 'Could not queue the card for reading.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: enq.job_id, status: 'queued', duplicate: false });
}

/**
 * Review-queue sort weight — DOUBTFUL FIRST (Director decision 25).
 *
 * Explicitly NOT newest-first: at a fair, thirty clean cards scanned after a
 * blurry one would bury the only card that actually needs a human, and the
 * blurry one is the one whose owner is still standing in front of you.
 * (Newest-first remains the default for SEARCH results — decision 14 — which is
 * a different surface.)
 *
 *   0  unreadable / errored → "Couldn't read it — retake?" (decision 20)
 *   1  read, confidence low
 *   2  read, confidence medium (or absent)
 *   3  read, confidence high → quick tap-confirm
 *   4  still being read → cannot be confirmed yet, so it sinks
 */
function reviewRank(status: string, confidence: string | null): number {
  if (status === 'error') return 0;
  if (status !== 'done') return 4;
  if (confidence === 'low') return 1;
  if (confidence === 'high') return 3;
  return 2;
}

/**
 * GET ?job_id=…   — one card's status/result
 * GET (no params) — this user's review queue, DOUBTFUL FIRST (decision 25)
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

  if (jobId) {
    query = query.eq('id', jobId);
  } else {
    // Already-saved cards leave the queue. Without this they keep re-appearing
    // and invite a second save of a card that already became a contact.
    const { data: saved } = await admin
      .from('contact_card_scans')
      .select('job_id')
      .eq('scanned_by', user.id);
    const savedIds = (saved ?? []).map((s) => s.job_id).filter(Boolean);
    if (savedIds.length > 0) {
      query = query.not('id', 'in', `(${savedIds.join(',')})`);
    }

    // The row cap must NOT truncate by recency before the doubtful-first sort
    // below — that is exactly how a blurry card sinks under thirty clean ones,
    // which decision 25 exists to prevent. Oldest-first keeps the longest-waiting
    // (and most likely forgotten, decision 22) cards inside the window, and the
    // cap is high enough that a realistic unsaved queue is never clipped.
    query = query.order('requested_at', { ascending: true }).limit(200);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[card-scan] read failed:', error.message);
    return NextResponse.json({ ok: false, error: 'Could not read the scan queue.' }, { status: 500 });
  }

  const rows = (data ?? []).map((j) => {
    const fields = (j.result as { fields?: Record<string, unknown> } | null)?.fields ?? null;
    const confidence =
      typeof fields?.confidence === 'string' ? (fields.confidence as string) : null;
    return {
      job_id: j.id,
      status: j.status,
      // The runner writes { fields, raw }; only `fields` is meant for the UI.
      fields,
      confidence,
      error: j.error,
      event: (j.payload as { event?: string | null } | null)?.event ?? null,
      storage_path: (j.payload as { storage_path?: string } | null)?.storage_path ?? null,
      requested_at: j.requested_at,
      completed_at: j.completed_at,
    };
  });

  // ── Signed URLs for the card photos ───────────────────────────────────────
  // `card-scans` is private and service-role-only on purpose: a browser must
  // never be able to enumerate other people's card photos. The review screen
  // still has to SHOW the card beside the extracted form (decision 5) and the
  // blurry one on a retake prompt (decision 20), so the server mints a
  // short-lived signed URL per row it has already scoped to this user.
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 15);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }
  const withPhotos = rows.map((r) => ({
    ...r,
    photo_url: r.storage_path ? (signed.get(r.storage_path) ?? null) : null,
  }));

  if (jobId) {
    return NextResponse.json({ ok: true, scan: withPhotos[0] ?? null });
  }

  // Doubtful first; within a band, oldest first — a card that has been waiting
  // longest is the one most likely to be forgotten (decision 22).
  withPhotos.sort((a, b) => {
    const ra = reviewRank(a.status, a.confidence);
    const rb = reviewRank(b.status, b.confidence);
    if (ra !== rb) return ra - rb;
    return String(a.requested_at).localeCompare(String(b.requested_at));
  });

  return NextResponse.json({ ok: true, scans: withPhotos });
}
