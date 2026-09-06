export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// app/api/cdc/recruiters/route.ts
// POST — create one or many recruiters from the drive form's inline "+ New
// Recruiter" and "Bulk Import" (BUG-004154 / BUG-004196 / BUG-004261: the
// recruiter dropdown was empty because cdc_recruiters had no rows and only CDC
// heads could add them).
//
// WHY service-role + an explicit permission gate:
//   cdc_recruiters write-RLS requires is_cdc_head_or_super(), but a *drive* can be
//   created by any CDC staff (is_cdc_staff) — so a coordinator hits the empty
//   dropdown and is stuck. Director decision (2026-06-29): anyone who can create a
//   drive may add the recruiters that drive needs. We therefore read/write with the
//   service-role client (bypassing the head-only RLS) but GATE on the same
//   permission the drive form requires — cdc.drives.create — so only drive-creators
//   get through. Duplicate names (case-insensitive) are skipped to limit junk.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface RecruiterInput {
  name?: unknown;
  website?: unknown;
  primary_contact_name?: unknown;
  primary_contact_email?: unknown;
}

function cleanStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Gate: same permission the drive form requires. Drive-creators may add the
    // recruiters their drive needs; nobody else can write recruiter master data.
    const { data: canCreate } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.drives.create',
    });
    if (canCreate !== true) {
      return NextResponse.json(
        { error: 'Forbidden — cdc.drives.create required to add recruiters' },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    const rawInputs: RecruiterInput[] = Array.isArray(body?.recruiters)
      ? body.recruiters
      : cleanStr(body?.name)
        ? [body as RecruiterInput]
        : [];

    // Normalise + drop blank names + de-dupe WITHIN the request (case-insensitive,
    // keep first occurrence).
    const seen = new Set<string>();
    const normalized = rawInputs
      .map((r) => ({
        name: cleanStr(r.name),
        website: cleanStr(r.website),
        primary_contact_name: cleanStr(r.primary_contact_name),
        primary_contact_email: cleanStr(r.primary_contact_email),
      }))
      .filter((r): r is { name: string; website: string | null; primary_contact_name: string | null; primary_contact_email: string | null } => {
        if (!r.name) return false;
        const key = r.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (normalized.length === 0) {
      return NextResponse.json({ error: 'No recruiter name provided' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // Skip names that already exist (case-insensitive). cdc_recruiters is a small,
    // global master table; reading every name is cheap and avoids duplicate rows.
    const { data: existing, error: readErr } = await svc.from('cdc_recruiters').select('name');
    if (readErr) {
      console.error('[cdc/recruiters] existing-name read failed:', readErr.message);
      return NextResponse.json({ error: 'Failed to check existing recruiters' }, { status: 500 });
    }
    const existingLower = new Set(
      ((existing ?? []) as Array<{ name: string | null }>)
        .map((r) => (r.name ?? '').toLowerCase())
        .filter(Boolean),
    );

    const toInsert = normalized.filter((r) => !existingLower.has(r.name.toLowerCase()));
    const skipped = normalized.length - toInsert.length;

    if (toInsert.length === 0) {
      return NextResponse.json({ added: 0, skipped, recruiters: [] });
    }

    const rows = toInsert.map((r) => ({
      name: r.name,
      website: r.website,
      primary_contact_name: r.primary_contact_name,
      primary_contact_email: r.primary_contact_email,
      created_by: user.id,
    }));

    const { data: inserted, error: insErr } = await svc
      .from('cdc_recruiters')
      .insert(rows)
      .select('id, name');
    if (insErr) {
      console.error('[cdc/recruiters] insert failed:', insErr.message);
      return NextResponse.json({ error: 'Failed to create recruiter(s)' }, { status: 500 });
    }

    return NextResponse.json(
      { added: (inserted ?? []).length, skipped, recruiters: inserted ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[cdc/recruiters] POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
