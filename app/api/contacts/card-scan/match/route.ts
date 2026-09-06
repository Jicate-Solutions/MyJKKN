/**
 * Business-card scanner — duplicate detection.
 *
 * Answers one question for the review screen: "have we already got this person?"
 * It never merges and never writes (Director decision 6: warn, show the match,
 * let the human choose update-vs-separate; NEVER auto-merge).
 *
 * Two populations are searched, because a card can duplicate either:
 *
 *   1. NETWORKER — the shared contact book (118 people). Decision 6.
 *   2. MyJKKN's OWN people — profiles / staff / admission_leads. Decision 24:
 *      "point it out and LINK to that person rather than creating a stranger
 *      with the same name." One person stays one person platform-wide.
 *
 * Matching is by PHONE first, then EMAIL, then name — in that order of trust.
 * That order is not arbitrary: the two real cards this was built against
 * (N. Thirukkumaran, Esstee Exports / Tiruppur Exporters' Association,
 * 2026-08-05) carry the SAME mobile and DIFFERENT name casing
 * ("N.THIRUKKUMARAN" vs "N.Thirukkumaran"), so a name-first matcher would have
 * missed a duplicate that a phone-first matcher catches exactly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchContacts, isNetworkerConfigured } from '@/lib/networker/client';

export const dynamic = 'force-dynamic';

/**
 * Reduce any printed phone to its last 10 digits.
 *   "+91 98430 41971"      → "9843041971"
 *   "91-421-6613666"       → "4216613666"
 * Indian numbers are 10 digits; the 91 country code and every separator style
 * a designer might use fall away. Anything shorter than 10 digits is treated as
 * unusable rather than padded — a partial match on 4 digits is worse than none.
 */
function last10(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export interface CardMatch {
  source: 'networker' | 'profiles' | 'team' | 'admission_leads';
  id: string;
  name: string;
  detail: string | null;
  /** What actually matched — shown to the user so the warning is explicable. */
  matched_on: 'phone' | 'email' | 'name';
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  let body: { name?: string; email?: string; phone?: string; mobile?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const phones = [last10(body.mobile), last10(body.phone)].filter(
    (p): p is string => Boolean(p),
  );

  const matches: CardMatch[] = [];
  const seen = new Set<string>();
  const add = (m: CardMatch) => {
    const k = `${m.source}:${m.id}`;
    if (!seen.has(k)) {
      seen.add(k);
      matches.push(m);
    }
  };

  // ── 1. Networker — the shared contact book ────────────────────────────────
  // Each signal is a separate free-text query; results are unioned and
  // de-duplicated by contact id.
  //
  // ⚠️  KNOWN GAP, measured live 2026-08-05: Networker's /api/contacts/search
  //     DOES NOT SEARCH THE PHONE FIELD. Probed against a contact whose stored
  //     phone is "+91 98430 41971":
  //         q=9843041971        → 0 results
  //         q=98430 41971       → 0 results
  //         q=+91 98430 41971   → 0 results
  //         q=Thirukkumaran     → 1 result
  //     So the phone probes below currently contribute NOTHING on the Networker
  //     half, and a duplicate there is caught by name/email alone. That is thin
  //     cover: 110 of the 118 contacts have no email at all, and the two real
  //     cards this was built against spell the same person's name two different
  //     ways. Two cards with genuinely different spellings WILL create a twin.
  //
  //     The fix belongs in Networker (add `phone` to the search filter, ideally
  //     matching on digits-only so formatting cannot defeat it). Until then the
  //     phone probes are kept — they cost one request each, they already work
  //     against MyJKKN's own tables below, and they start working the moment
  //     Networker's endpoint is fixed, with no change needed here.
  const networkerDown = { down: false as boolean };
  if (isNetworkerConfigured()) {
    const probes: Array<{ q: string; on: CardMatch['matched_on'] }> = [
      ...phones.map((p) => ({ q: p, on: 'phone' as const })),
      ...(email ? [{ q: email, on: 'email' as const }] : []),
      ...(name ? [{ q: name, on: 'name' as const }] : []),
    ];

    for (const probe of probes) {
      try {
        const res = await searchContacts(probe.q, 5);
        for (const c of res.data ?? []) {
          // The free-text search is deliberately loose, so a name probe can
          // return near-misses. Only phone/email probes are trusted verbatim;
          // a name hit is confirmed against the name we actually read.
          if (probe.on === 'name') {
            const a = c.name?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
            const b = name.toLowerCase().replace(/[^a-z]/g, '');
            if (!a || !b || (!a.includes(b) && !b.includes(a))) continue;
          }
          add({
            source: 'networker',
            id: c.id,
            name: c.name,
            detail: [c.organization, c.role].filter(Boolean).join(' · ') || null,
            matched_on: probe.on,
          });
        }
      } catch (err) {
        // Networker being unreachable must NOT block a save. The user is told
        // the check could not run rather than being shown a false "no duplicates"
        // — a silent empty result here would read as "definitely new" and
        // manufacture the twin this whole route exists to prevent.
        networkerDown.down = true;
        console.error(
          '[card-scan/match] networker probe failed:',
          err instanceof Error ? err.message : String(err),
        );
        break;
      }
    }
  }

  // ── 2. MyJKKN's own people (decision 24) ──────────────────────────────────
  // Deliberately the SESSION client, not the service role: this must not become
  // an oracle that reveals learners or staff the caller has no right to see.
  // The cost is that RLS denial is silent (0 rows, error null), so a match the
  // caller cannot read simply does not appear — the check is a safety net, not
  // an exhaustive guarantee, and the UI says so.
  // Deliberately NOT a string-built `.or()`. Interpolating the card's email into
  // a PostgREST filter string (`email.eq.${email}`) lets a comma or parenthesis
  // in that value inject extra predicates or 500 the query — and the email comes
  // straight off a photographed card, i.e. from outside. Each signal therefore
  // runs as its own PARAMETERIZED query and the results are unioned here.
  // Phones are already digits-only so they were never the risk; email was.
  const runProbes = async <T>(
    table: 'profiles' | 'staff' | 'admission_leads',
    cols: string,
    phoneCol: string,
  ): Promise<T[]> => {
    const queries = [];
    if (email) {
      queries.push(supabase.from(table).select(cols).eq('email', email).limit(5));
    }
    for (const p of phones) {
      queries.push(supabase.from(table).select(cols).ilike(phoneCol, `%${p}%`).limit(5));
    }
    if (queries.length === 0) return [];
    const settled = await Promise.all(queries);
    const merged = new Map<string, T>();
    for (const r of settled) {
      for (const row of (r.data ?? []) as unknown as Array<T & { id: string }>) {
        merged.set(row.id, row as T);
      }
    }
    return [...merged.values()].slice(0, 5);
  };

  if (email || phones.length) {
    const [profRows, stfRows, leadRows] = await Promise.all([
      runProbes<{ id: string; full_name: string | null; email: string | null }>(
        'profiles',
        'id, full_name, email, phone_number',
        'phone_number',
      ),
      runProbes<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>(
        'staff',
        'id, first_name, last_name, email, phone',
        'phone',
      ),
      runProbes<{ id: string; full_name: string | null; email: string | null; phone: string | null }>(
        'admission_leads',
        'id, full_name, email, phone',
        'phone',
      ),
    ]);
    const prof = { data: profRows };
    const stf = { data: stfRows };
    const leads = { data: leadRows };

    for (const p of prof.data ?? []) {
      add({
        source: 'profiles',
        id: p.id,
        name: p.full_name ?? p.email ?? 'Unnamed',
        detail: p.email ?? null,
        matched_on: email && p.email?.toLowerCase() === email ? 'email' : 'phone',
      });
    }
    for (const s of stf.data ?? []) {
      add({
        source: 'team',
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unnamed',
        detail: s.email ?? null,
        matched_on: email && s.email?.toLowerCase() === email ? 'email' : 'phone',
      });
    }
    for (const l of leads.data ?? []) {
      add({
        source: 'admission_leads',
        id: l.id,
        name: l.full_name ?? 'Unnamed',
        detail: l.email ?? l.phone ?? null,
        matched_on: email && l.email?.toLowerCase() === email ? 'email' : 'phone',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    matches,
    /** True when the Networker half could not be checked — NOT "no duplicates". */
    networker_unavailable: networkerDown.down,
  });
}
