/**
 * Business-card scanner — confirm and save.
 *
 * This is the ONLY write path for a scanned card, and it runs only after a human
 * has looked at the extracted form beside the photo and pressed Save
 * (Director decision 5: confirm-before-save always; nothing enters unchecked).
 *
 * Two modes, both chosen by the human on the duplicate warning, never inferred:
 *   create  → POST   /api/contacts/ingest  — a new person
 *   enrich  → PATCH  /api/contacts/ingest  — fill the blanks on an existing one
 *
 * PATCH is fill-only on Networker's side: it refuses to overwrite a value a
 * human already recorded and returns those fields in `skipped`. That list is
 * passed straight back to the caller — surfacing "the card says X, we have Y"
 * is the point; swallowing it would make a partial save look like a clean one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { ingestContact, enrichContact, isNetworkerConfigured } from '@/lib/networker/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Fields the review form owns. Anything else the model returned is ignored. */
const EDITABLE = [
  'name',
  'organization',
  'role',
  'email',
  'phone',
  'mobile',
  'website',
  'linkedin',
  'address',
  'city',
  'handwritten_note',
] as const;

type Editable = (typeof EDITABLE)[number];
type Fields = Partial<Record<Editable, string | null>>;

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Which fields the human changed from what the model produced (decision 15).
 * This is the raw material of the correction-rate metric — AI output vs human
 * fix, per field. It is CAPTURE only: no claim is made here that this is a
 * learning loop, and none should be made until it clears the loop birth-gate.
 */
function diffFields(ai: Fields, human: Fields): string[] {
  const changed: string[] = [];
  for (const k of EDITABLE) {
    const a = clean(ai[k]) ?? '';
    const h = clean(human[k]) ?? '';
    if (a !== h) changed.push(k);
  }
  return changed;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  if (!isNetworkerConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'The contact book is not connected. Ask an administrator.' },
      { status: 503 },
    );
  }

  let body: {
    job_id?: string;
    fields?: Fields;
    mode?: 'create' | 'enrich';
    target_id?: string;
    routed_to?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected JSON' }, { status: 400 });
  }

  const jobId = clean(body.job_id);
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'job_id is required' }, { status: 400 });
  }

  const human: Fields = {};
  for (const k of EDITABLE) human[k] = clean(body.fields?.[k]);

  if (!human.name) {
    return NextResponse.json(
      { ok: false, error: 'A name is required before this card can be saved.' },
      { status: 400 },
    );
  }

  // ── The scan must belong to this user ─────────────────────────────────────
  const admin = createServiceRoleClient();
  const { data: job } = await admin
    .from('ai_jobs')
    .select('id, status, result, payload, requested_by')
    .eq('id', jobId)
    .eq('job_type', 'contacts.card_extract')
    .eq('requested_by', user.id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ ok: false, error: 'That scan was not found.' }, { status: 404 });
  }

  const aiFields = ((job.result as { fields?: Fields } | null)?.fields ?? {}) as Fields;
  const event = (job.payload as { event?: string | null } | null)?.event ?? null;

  // ── Keep every number, even the ones the schema has no column for ─────────
  // Decision 10 says keep EVERY phone/email and mark one primary. Networker's
  // `contacts` table has exactly ONE phone and ONE email column, so the surplus
  // has nowhere structured to live. Losing it silently is the failure mode this
  // build already met once — a real card printed THREE numbers and the extractor
  // returned two, at confidence:"high", with nothing to signal the loss.
  //
  // Reads BOTH shapes on purpose. The revised box prompt returns `phones: [{number,
  // label}]`; an un-updated box still returns only `phone` + `mobile`. Handling
  // both means the correct behaviour does not depend on which version of the
  // runner happened to read this particular card.
  const rawExtract = (job.result as { fields?: Record<string, unknown> } | null)?.fields ?? {};
  const listedPhones = Array.isArray(rawExtract.phones)
    ? (rawExtract.phones as Array<{ number?: unknown; label?: unknown }>)
        .map((p) => ({
          number: typeof p?.number === 'string' ? p.number.trim() : '',
          label: typeof p?.label === 'string' ? p.label.trim() : '',
        }))
        .filter((p) => p.number)
    : [];
  const listedEmails = Array.isArray(rawExtract.emails)
    ? (rawExtract.emails as unknown[]).filter(
        (e): e is string => typeof e === 'string' && e.trim().length > 0,
      )
    : [];

  const primaryPhone = human.mobile ?? human.phone;
  const primaryEmail = human.email;

  // Compare on digits so "+91 98430 41971" and "9843041971" are not both kept.
  const digits = (s: string) => s.replace(/\D/g, '');
  const seenPhone = new Set([primaryPhone, human.phone, human.mobile].filter(Boolean).map((p) => digits(p as string)));
  const extraLines: string[] = [];

  for (const p of listedPhones) {
    if (seenPhone.has(digits(p.number))) continue;
    seenPhone.add(digits(p.number));
    extraLines.push(`Also on: ${p.number}${p.label ? ` (${p.label})` : ''}`);
  }
  // Fallback for the un-updated box: the two fixed fields may still disagree.
  if (listedPhones.length === 0 && human.mobile && human.phone && human.mobile !== human.phone) {
    extraLines.push(`Also on: ${human.phone}`);
  }
  for (const e of listedEmails) {
    if (primaryEmail && e.toLowerCase() === primaryEmail.toLowerCase()) continue;
    extraLines.push(`Also at: ${e}`);
  }

  if (human.handwritten_note) extraLines.push(human.handwritten_note);
  if (body.routed_to) extraLines.push(`Who: ${body.routed_to}`);

  const location = [human.address, human.city].filter(Boolean).join(', ') || null;

  const payload = {
    name: human.name,
    organization: human.organization ?? undefined,
    role: human.role ?? undefined,
    email: human.email ?? undefined,
    phone: primaryPhone ?? undefined,
    website: human.website ?? undefined,
    linkedin: human.linkedin ?? undefined,
    location: location ?? undefined,
    notes: extraLines.length ? extraLines.join('\n') : undefined,
    introduced_by: event ?? undefined,
    scanned_by: user.email ?? undefined,
  };

  // ── Write ─────────────────────────────────────────────────────────────────
  let result;
  try {
    if (body.mode === 'enrich') {
      const targetId = clean(body.target_id);
      if (!targetId) {
        return NextResponse.json(
          { ok: false, error: 'Which existing contact should be updated?' },
          { status: 400 },
        );
      }
      result = await enrichContact(targetId, payload);
    } else {
      result = await ingestContact(payload);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[card-scan/save] networker write failed:', message);
    return NextResponse.json(
      { ok: false, error: 'Could not save to the contact book. Your card is still in the queue.' },
      { status: 502 },
    );
  }

  // ── Correction capture (decision 15) — best effort, never blocks a save ───
  // The table ships in migration 20260811090100 and may not be applied yet on
  // every environment. A missing table must not cost the user a confirmed card,
  // so a failure here is logged and swallowed. The save above has already
  // succeeded and is the thing the user cares about.
  const corrected = diffFields(aiFields, human);
  const { error: trackErr } = await admin.from('contact_card_scans').insert({
    job_id: jobId,
    scanned_by: user.id,
    networker_contact_id: result?.data?.id ?? null,
    save_mode: result?.mode ?? 'created',
    ai_fields: aiFields,
    final_fields: human,
    corrected_fields: corrected,
    routed_to: body.routed_to ?? null,
    event_label: event,
  });
  if (trackErr) {
    console.warn('[card-scan/save] correction tracking skipped:', trackErr.message);
  }

  return NextResponse.json({
    ok: true,
    mode: result?.mode ?? 'created',
    contact: result?.data ?? null,
    /** Fields the card disagreed with that were NOT overwritten (enrich only). */
    skipped: result?.skipped ?? [],
    filled: result?.filled ?? [],
    corrected_fields: corrected,
    correction_tracking: trackErr ? 'unavailable' : 'recorded',
  });
}
