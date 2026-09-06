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
import {
  ingestContact,
  enrichContact,
  isNetworkerConfigured,
  searchContacts,
} from '@/lib/networker/client';
import { routeCard } from '@/lib/services/contacts/card-routing';

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

/**
 * The Networker contacts that are a legitimate enrich target for THIS card,
 * keyed by id, carrying the note each one already holds.
 *
 * Re-derived server-side rather than trusted from the request body. `target_id`
 * arriving from the client is otherwise an unscoped fill-write into any contact
 * in the shared book — including ones the duplicate check never showed the user.
 * Cheap: the same searches /match already runs, against a 118-row book.
 *
 * The existing note comes back on the same search, so keeping it here costs
 * nothing and saves the enrich path a second round-trip to find out what the
 * contact's note already says.
 */
async function matchableContacts(f: Fields): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>();
  if (!isNetworkerConfigured()) return found;

  const digitsOnly = (s: string) => s.replace(/\D/g, '');
  const probes = [f.name, f.email, f.mobile, f.phone]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .map((v) => (digitsOnly(v).length >= 7 ? digitsOnly(v) : v));

  for (const p of probes) {
    try {
      const res = await searchContacts(p, 10);
      for (const c of res.data ?? []) found.set(c.id, c.notes ?? null);
    } catch {
      // A search outage must not silently widen what may be written. Returning
      // what we have means an unverifiable target_id is refused, not accepted.
      break;
    }
  }
  return found;
}

/**
 * The subset of `lines` the contact's note does not already carry.
 *
 * Networker's PATCH /api/contacts/ingest APPENDS what it is sent
 * (`notes = existing + '\n\n' + incoming`) so that handwritten scribbles
 * accumulate across cards — decision 7, and correct on its own terms. But this
 * route rebuilds the WHOLE extra-lines block from scratch on every scan, so a
 * second card from the same person re-sends lines the note already has: the
 * routing line in particular ("Who: Supplier") reappears once per scan forever.
 *
 * Compared line by line rather than by substring: an entry may itself be
 * multi-line (a handwritten note), and a substring test would let one phone
 * number suppress a longer one that merely contains it.
 */
export function linesNotAlreadyInNote(lines: string[], existingNote: string | null): string[] {
  const present = new Set(
    (existingNote ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  if (present.size === 0) return lines;

  return lines.filter((entry) => {
    const own = entry
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return !own.every((l) => present.has(l));
  });
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
    /** Chosen in the picker when a destination needs a parent it cannot infer. */
    event_id?: string;
    site_id?: string;
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

  // ── Claim the scan BEFORE writing to the contact book ─────────────────────
  // `contact_card_scans` is UNIQUE on job_id, so this insert is the idempotency
  // lock. It must happen BEFORE the Networker write, not after: a double-tap on
  // Save, a retry over a flaky connection, or the card re-appearing in the queue
  // would otherwise each create a SECOND contact — the exact twin this feature
  // exists to prevent. Claim first, write second, then record the outcome.
  const corrected = diffFields(aiFields, human);
  const { error: claimErr } = await admin.from('contact_card_scans').insert({
    job_id: jobId,
    scanned_by: user.id,
    save_mode: 'created',
    ai_fields: aiFields,
    final_fields: human,
    corrected_fields: corrected,
    routed_to: body.routed_to ?? null,
    event_label: event,
  });

  // 23505 = unique_violation on job_id → this card has already been saved.
  if (claimErr && claimErr.code === '23505') {
    const { data: prior } = await admin
      .from('contact_card_scans')
      .select('networker_contact_id, save_mode')
      .eq('job_id', jobId)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      already_saved: true,
      mode: prior?.save_mode ?? 'created',
      contact: prior?.networker_contact_id ? { id: prior.networker_contact_id } : null,
      message: 'This card was already saved.',
    });
  }
  // 42P01 = table missing (migration not applied in this environment). Do not
  // cost the user a confirmed card over a missing guard — proceed unguarded and
  // say so in the response rather than pretending the guard held.
  const guarded = !claimErr;
  if (claimErr && claimErr.code !== '42P01') {
    console.error('[card-scan/save] claim failed:', claimErr.message);
    return NextResponse.json(
      { ok: false, error: 'Could not save this card. Please try again.' },
      { status: 500 },
    );
  }

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
      // `target_id` must be a contact the duplicate check actually surfaced for
      // THIS card. Without it the body carries an unscoped fill-write primitive
      // into any contact id in the shared book, shown to the user or not.
      const allowed = await matchableContacts(human);
      if (!allowed.has(targetId)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'That contact is no longer a match for this card. Reopen the card and pick from the list shown.',
          },
          { status: 409 },
        );
      }
      // Send only what this contact's note does not already say. Networker
      // appends whatever it receives, so re-sending the whole block would stack
      // a fresh copy of every line each time this person is scanned again.
      const freshLines = linesNotAlreadyInNote(extraLines, allowed.get(targetId) ?? null);
      result = await enrichContact(targetId, {
        ...payload,
        notes: freshLines.length ? freshLines.join('\n') : undefined,
      });
    } else {
      result = await ingestContact(payload);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[card-scan/save] networker write failed:', message);
    // Release the claim so the user can try again. Leaving it would lock this
    // card out of saving forever behind a guard for a write that never landed.
    if (guarded) await admin.from('contact_card_scans').delete().eq('job_id', jobId);
    return NextResponse.json(
      { ok: false, error: 'Could not save to the contact book. Your card is still in the queue.' },
      { status: 502 },
    );
  }

  // ── Route to the module's own table (decisions 17/18) ─────────────────────
  // Runs AFTER the contact book write and never blocks it: by here the person
  // is already saved, and decision 18 is explicit that an unroutable or
  // half-filled module record must not cost the user their scan.
  const { data: prof } = await admin
    .from('profiles')
    .select('institution_id')
    .eq('id', user.id)
    .maybeSingle();

  const routing = await routeCard(
    admin,
    body.routed_to,
    {
      name: human.name!,
      organization: human.organization,
      role: human.role,
      email: human.email,
      phone: human.phone,
      mobile: human.mobile,
      website: human.website,
      city: human.city,
      note: human.handwritten_note,
    },
    {
      institutionId: (prof as { institution_id?: string | null } | null)?.institution_id ?? null,
      scannedByProfileId: user.id,
      scannedByEmail: user.email ?? null,
      eventId: clean(body.event_id),
      siteId: clean(body.site_id),
      eventLabel: event,
    },
  ).catch((e): null => {
    console.error('[card-scan/save] routing threw:', e instanceof Error ? e.message : String(e));
    return null;
  });

  const routingStatus = !routing
    ? 'failed'
    : routing.routed
      ? 'routed'
      : routing.pendingParent
        ? 'pending_parent'
        : routing.error
          ? 'failed'
          : 'none';

  // ── Record the outcome on the claim row (decision 15) ─────────────────────
  // The row already exists (claimed above); this fills in where the contact
  // landed. Correction capture is the point: AI output vs human fix, per field.
  // Capture only — nothing here closes a loop and no moat claim is earned by it.
  if (guarded) {
    const { error: trackErr } = await admin
      .from('contact_card_scans')
      .update({
        networker_contact_id: result?.data?.id ?? null,
        save_mode: result?.mode ?? 'created',
        routed_table: routing?.table ?? null,
        routed_row_id: routing?.rowId ?? null,
        routing_status: routingStatus,
        pending_parent: routing?.pendingParent ?? null,
        missing_fields: routing?.missingFields ?? [],
        routing_error: routing?.error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', jobId);
    if (trackErr) {
      console.warn('[card-scan/save] outcome not recorded:', trackErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: result?.mode ?? 'created',
    contact: result?.data ?? null,
    /** Fields the card disagreed with that were NOT overwritten (enrich only). */
    skipped: result?.skipped ?? [],
    filled: result?.filled ?? [],
    corrected_fields: corrected,
    correction_tracking: guarded ? 'recorded' : 'unavailable',
    /** Where the module row landed, or why it could not (decisions 17/18). */
    routing: routing
      ? {
          status: routingStatus,
          table: routing.table,
          needs: routing.pendingParent,
          missing_fields: routing.missingFields,
          scheduling_contact: routing.meetingContactWritten,
          error: routing.error,
        }
      : { status: 'failed', table: null, needs: null, missing_fields: [], error: 'routing failed' },
  });
}
