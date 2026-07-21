// app/api/pde/cases/import-from-pms/route.ts
// 2026-07-20 no-op touch: trigger a rebuild so the PMS_EXPORT_* env vars activate (env-only changes are skipped by the ignored-build-step).
// ============================================================================
// Server-to-server "casesheet → PDE teaching case" import.
//
//   GET  ?q=<condition>  → proxy the PMS de-identified condition search
//   POST { casesheet_id } → pull a de-identified casesheet from the PMS app,
//                           draft OSCE questions/weights/ground-truth on the ₹0
//                           Max lane (pde.case_author), and RETURN the assembled
//                           CreateClinicalCaseInput for the faculty form builder.
//
// This route NEVER writes a case — the faculty reviews the AI draft in the
// builder and clicks "Save as draft" (POST /api/pde/cases). AI clinical content
// is never auto-created. The PMS half already de-identifies; here the case facts
// are fenced as untrusted data in the prompt and the job is tool_set='none'.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // long-poll the Max drain (claims ~every minute)

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, awaitJobsLaneResults } from '@/lib/services/platform/ai-jobs-lane';
import { buildAuthorPrompt, parseDraft, type PmsExport } from '@/lib/services/pde/case-author-draft';
import type { CreateClinicalCaseInput, ImportedPmsImage } from '@/types/pde';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pmsConfig(): { base: string; headers: Record<string, string> } | null {
  const base = (process.env.PMS_EXPORT_URL ?? '').replace(/\/+$/, '');
  const token = process.env.PMS_EXPORT_TOKEN ?? '';
  if (!base || token.length < 16) return null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Cloudflare Access service token — Zero Trust wall in front of the PMS export
  // path. When set, Cloudflare rejects requests without these headers before they
  // reach the PMS host. Dormant (bearer-only) until BOTH env vars exist.
  const cfId = process.env.PMS_CF_ACCESS_CLIENT_ID ?? '';
  const cfSecret = process.env.PMS_CF_ACCESS_CLIENT_SECRET ?? '';
  if (cfId && cfSecret) {
    headers['CF-Access-Client-Id'] = cfId;
    headers['CF-Access-Client-Secret'] = cfSecret;
  }
  return { base, headers };
}

// ─── GET — proxy the PMS condition search ───────────────────────────────────
export async function GET(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized', hits: [] }, { status: 401 });

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const cfg = pmsConfig();
  if (!cfg) return NextResponse.json({ error: 'PMS import is not configured.', hits: [] }, { status: 503 });

  try {
    const res = await fetch(`${cfg.base}/api/pde-export/search?q=${encodeURIComponent(q)}`, {
      headers: cfg.headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return NextResponse.json({ error: 'PMS search is unavailable.', hits: [] }, { status: 502 });
    const data = (await res.json()) as { hits?: unknown };
    const hits = Array.isArray(data?.hits) ? data.hits.slice(0, 25) : [];
    return NextResponse.json({ hits });
  } catch {
    return NextResponse.json({ error: 'PMS search failed.', hits: [] }, { status: 502 });
  }
}

// ─── POST — pull one casesheet + AI-draft the case ──────────────────────────
export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { casesheet_id?: unknown; course_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const casesheetId = typeof body.casesheet_id === 'string' ? body.casesheet_id.trim() : '';
  if (!UUID_RE.test(casesheetId)) return NextResponse.json({ error: 'Valid casesheet_id required.' }, { status: 400 });
  const courseId = typeof body.course_id === 'string' && UUID_RE.test(body.course_id) ? body.course_id : undefined;

  const cfg = pmsConfig();
  if (!cfg) return NextResponse.json({ error: 'PMS import is not configured on this server.' }, { status: 503 });

  // 1. Pull the de-identified casesheet from PMS.
  let exported: PmsExport;
  try {
    const res = await fetch(`${cfg.base}/api/pde-export/casesheet/${casesheetId}`, {
      headers: cfg.headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return NextResponse.json({ error: 'That casesheet was not found in PMS.' }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: 'Could not reach the PMS export service.' }, { status: 502 });
    exported = (await res.json()) as PmsExport;
  } catch {
    return NextResponse.json({ error: 'PMS export timed out. Please try again.' }, { status: 502 });
  }
  if (!exported?.case_scenario?.chief_complaint) {
    return NextResponse.json({ error: 'That casesheet has too little clinical detail to build a case.' }, { status: 422 });
  }

  // 1b. Copy de-identified images (≤6) into the pde-clinical-images bucket as
  //     CANDIDATES. The PMS side already strips all file metadata (sharp
  //     re-encode + fail-closed marker assertion); burned-in pixel identifiers
  //     can survive that, so the builder requires faculty to confirm each image
  //     before it can be attached — nothing is auto-placed on the case here.
  //     A failed image never fails the text import.
  const admin = createServiceRoleClient();
  const images: ImportedPmsImage[] = [];
  const candidates = Array.isArray(exported.images) ? exported.images.slice(0, 6) : [];
  for (const im of candidates) {
    if (!im || typeof im.image_id !== 'string' || !UUID_RE.test(im.image_id)) continue;
    try {
      const r = await fetch(`${cfg.base}/api/pde-export/casesheet/${casesheetId}/images/${im.image_id}`, {
        headers: cfg.headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      // The bridge re-encodes to JPEG ≤1920px; sniff the magic bytes anyway so a
      // PMS-side error page or wrong payload can never land in the bucket.
      if (buf.length < 1024 || buf.length > 10 * 1024 * 1024) continue;
      if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) continue;
      const path = `${casesheetId}/${im.image_id}.jpg`;
      const up = await admin.storage
        .from('pde-clinical-images')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
      if (up.error) continue;
      const pub = admin.storage.from('pde-clinical-images').getPublicUrl(path);
      images.push({
        url: pub.data.publicUrl,
        kind: typeof im.kind === 'string' ? im.kind : 'clinical_photo',
        taken_at: typeof im.taken_at === 'string' ? im.taken_at : undefined,
        seq: Number.isFinite(im.seq) ? Number(im.seq) : images.length + 1,
      });
    } catch {
      // skip this image — text import continues
    }
  }

  // 2. Draft questions/weights/ground-truth on the ₹0 Max lane.
  const prompt = buildAuthorPrompt(exported);
  const enq = await enqueueJobsLane(admin, {
    jobType: 'pde.case_author',
    prompt,
    context: { casesheet_id: casesheetId },
    dedupeKey: `pde-case-author:${casesheetId}`,
  });
  if (!enq.ok) {
    if ('reason' in enq && enq.reason === 'in_flight') {
      return NextResponse.json({ error: 'This case is already being drafted — try again shortly.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'The AI drafting lane is unavailable right now. Please try again later.' }, { status: 503 });
  }

  const results = await awaitJobsLaneResults(admin, [enq.jobId], { deadlineMs: 270_000, intervalMs: 2_500 });
  const text = results.get(enq.jobId);
  if (!text) return NextResponse.json({ error: 'The AI didn’t finish drafting in time. Please try again.' }, { status: 504 });

  const draft = parseDraft(text);
  if (!draft) return NextResponse.json({ error: 'The AI returned a draft we couldn’t read. Please try again.' }, { status: 502 });

  // 3. Assemble — but DO NOT write. Faculty reviews in the builder, then saves.
  const assembled: Partial<CreateClinicalCaseInput> = {
    course_id: courseId,
    title: (exported.suggested_title || 'Imported clinical case').slice(0, 200),
    description:
      `Imported from a de-identified PMS casesheet (${casesheetId}). ` +
      `AI-drafted questions and answer-keys — verify clinical accuracy before publishing.`,
    // PMS supplies these fields at runtime; the form builder validates before save.
    case_scenario: exported.case_scenario as unknown as CreateClinicalCaseInput['case_scenario'],
    metadata: { domain_weights: draft.domain_weights, discipline: 'Dentistry', source: 'pms+ai' },
    questions: draft.questions,
    pass_threshold: 60,
  };
  return NextResponse.json({ data: assembled, images, sufficiency: exported.source?.sufficiency ?? 'ok' });
}
