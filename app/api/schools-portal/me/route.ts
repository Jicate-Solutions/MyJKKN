/**
 * GET /api/schools-portal/me
 *
 * Returns the signed-in HM's school summary:
 *   - school: { id, name, district, state, status, intake_year }
 *   - recentSessions: last 5 sessions (type label + conducted_at + attendees + topic)
 *   - contributions: list of contributions delivered by JKKN/partners
 *   - jkknOwners: active JKKN-side ownership rows (in-charge contacts)
 *   - selfContact: the HM's own school_contacts row (for the contact-update page)
 *
 * RLS is bypassed (service-role) — we enforce school_id scope here in the
 * code instead. Every query filters by `claims.schoolId`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveHmSession } from '@/lib/services/schools-portal/session-guard';
import { logger } from '@/lib/utils/enhanced-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await resolveHmSession(req);
  if (guard instanceof NextResponse) return guard;
  const { claims, db } = guard;

  const schoolId = claims.schoolId;

  // Parallel reads; tolerate one failing gracefully (return what we have so
  // the dashboard is still useful even if Agent A's full module isn't applied).
  const [
    schoolRes,
    contactRes,
    sessionsRes,
    contributionsRes,
    ownersRes,
  ] = await Promise.all([
    db
      .from('schools')
      .select(
        'id, name, district, state, status, intake_year, address, ownership',
      )
      .eq('id', schoolId)
      .maybeSingle(),
    db
      .from('school_contacts')
      .select(
        `
          id,
          school_id,
          name,
          phone,
          email,
          is_primary,
          notes,
          role:school_contact_roles!inner(code, label)
        `,
      )
      .eq('id', claims.sub)
      .maybeSingle(),
    db
      .from('school_sessions')
      .select(
        `
          id,
          conducted_at,
          attendee_count,
          topic,
          notes,
          session_type:school_session_types!inner(code, label),
          program_partner:program_partners(id, name)
        `,
      )
      .eq('school_id', schoolId)
      .order('conducted_at', { ascending: false })
      .limit(5),
    db
      .from('school_contributions')
      .select(
        `
          id,
          kind,
          description,
          value_inr,
          delivered_at,
          evidence_url,
          program_partner:program_partners(id, name)
        `,
      )
      .eq('school_id', schoolId)
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(20),
    db
      .from('school_jkkn_owners')
      .select(
        `
          id,
          role,
          assigned_at,
          program_partner:program_partners(id, name),
          jkkn_user:profiles!school_jkkn_owners_jkkn_user_id_fkey(id, full_name, email, phone)
        `,
      )
      .eq('school_id', schoolId)
      .eq('is_active', true),
  ]);

  if (schoolRes.error) {
    logger.warn('schools-portal/me', 'school fetch failed', {
      schoolId,
      code: schoolRes.error.code,
      message: schoolRes.error.message,
    });
  }

  return NextResponse.json({
    ok: true,
    school: schoolRes.data ?? null,
    selfContact: contactRes.data ?? null,
    recentSessions: sessionsRes.data ?? [],
    contributions: contributionsRes.data ?? [],
    jkknOwners: ownersRes.data ?? [],
  });
}
