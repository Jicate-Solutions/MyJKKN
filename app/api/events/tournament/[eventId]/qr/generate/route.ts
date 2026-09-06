export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/events/tournament/[eventId]/qr/generate
//
// Returns a QR entry-pass per ACTIVE tournament entry (mirrors the marathon QR
// pass generation, adapted to the tournament data model). Ported from
//   app/api/events/marathon/[eventId]/qr/generate/route.ts
//   app/api/events/marathon/[eventId]/qr/[bibNumber]/route.ts
//
// Tournaments have no BIB numbers and no `qr_code_url` storage column, so — unlike
// marathon — nothing is persisted or uploaded to a bucket. Each pass is generated
// on the fly as a self-contained PNG data URL (via the `qrcode` lib) and returned
// inline, so the printable passes board can render/print/download it directly with
// zero new DB tables, columns, or storage buckets.
//
// The QR encodes the entry's `access_code` if one is ever present, else the entry
// `id` (a globally-unique UUID) — the natural token for a gate scanner to resolve
// the entry. "Active" = not withdrawn/disqualified (both `registered` and
// `confirmed` entrants attend and need a pass; leaving entries at the default
// `registered` should NOT produce an empty board).
//
// Access: organizer / in-charge only — gated on canManageTournament (holders of
// sports.tournaments.manage OR this event's in-charges). Committee/view-only roles
// get 403; passes are a manage-only artifact.

import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';

/** Public-safe division label: "Badminton · U-19 · female" (mirrors detail page). */
function divisionLabel(d: {
  sport?: string | null;
  age_band?: string | null;
  gender?: string | null;
} | null | undefined): string {
  if (!d) return '';
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // --- Auth: organizer / in-charge only ---------------------------------
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json(
        { error: 'Forbidden — tournament organizer or in-charge only' },
        { status: 403 }
      );
    }

    // --- Data: service role (bypasses RLS; access already enforced above) --
    const svc = createServiceRoleClient() as any;

    const { data: event, error: eventError } = await svc
      .from('events')
      .select('id, name')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Active entries only (exclude withdrawn / disqualified), joined to their
    // division for a public-safe label. entry_name is already public-safe.
    const { data: entries, error: entriesError } = await svc
      .from('tournament_entries')
      .select(
        `
        id, event_id, division_id, entry_name, entry_type, institution_name,
        is_external, seed, status,
        division:tournament_divisions (
          sport, gender, age_band
        )
      `
      )
      .eq('event_id', eventId)
      .in('status', ['registered', 'confirmed'])
      .order('division_id', { ascending: true })
      .order('seed', { ascending: true, nullsFirst: false })
      .order('entry_name', { ascending: true });

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }

    const rows = entries ?? [];

    // Generate a QR data URL per entry. `access_code` is not a column today, so
    // this falls through to the entry id; if such a column is ever added the pass
    // will automatically encode it instead (future-proof, per the port brief).
    const passes = await Promise.all(
      rows.map(async (e: any) => {
        const code: string = e.access_code ?? e.id;
        const qr = await QRCode.toDataURL(code, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
        });
        const division = Array.isArray(e.division) ? e.division[0] : e.division;
        return {
          id: e.id,
          entry_name: e.entry_name,
          entry_type: e.entry_type,
          division_id: e.division_id,
          division_label: divisionLabel(division),
          institution_name: e.institution_name ?? null,
          is_external: !!e.is_external,
          seed: e.seed ?? null,
          status: e.status,
          code,
          qr,
        };
      })
    );

    return NextResponse.json({
      event: { id: event.id, name: event.name },
      count: passes.length,
      passes,
    });
  } catch (error) {
    console.error('[tournament-api/qr/generate] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
