/**
 * PATCH /api/schools-portal/me/contact
 *
 * Lets the signed-in HM update their own school_contacts row — phone,
 * alternate name, notes. Email changes are intentionally NOT allowed here:
 * the email is the login identifier (and would invalidate the magic-link
 * audit trail). To rotate an email, an admin must update school_contacts
 * directly.
 *
 * Only the HM's own row (school_contacts.id = claims.sub) is mutable. We
 * never accept school_id from the body — it comes from the verified session
 * claims to prevent IDOR.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveHmSession } from '@/lib/services/schools-portal/session-guard';
import { logger } from '@/lib/utils/enhanced-logger';

export const runtime = 'nodejs';

interface ContactPatchBody {
  name?: string;
  phone?: string | null;
  notes?: string | null;
}

function sanitize(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function PATCH(req: NextRequest) {
  const guard = await resolveHmSession(req);
  if (guard instanceof NextResponse) return guard;
  const { claims, db } = guard;

  let body: ContactPatchBody;
  try {
    body = (await req.json()) as ContactPatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Build a strict-allowlist update payload. Email + school_id + role +
  // is_primary + id are NEVER updatable from this endpoint.
  const payload: Record<string, string | null> = {};
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = sanitize(body.name, 200);
    if (!name) {
      return NextResponse.json(
        { error: 'Name cannot be empty' },
        { status: 400 },
      );
    }
    payload.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    payload.phone = sanitize(body.phone, 32);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    payload.notes = sanitize(body.notes, 1000);
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { error: 'No updatable fields supplied' },
      { status: 400 },
    );
  }

  // Scope: own row only. We also reassert school_id to prevent any
  // accidental cross-tenant write if the session was tampered with.
  const { data, error } = await db
    .from('school_contacts')
    .update(payload)
    .eq('id', claims.sub)
    .eq('school_id', claims.schoolId)
    .select('id, name, phone, email, notes')
    .maybeSingle();

  if (error) {
    logger.error('schools-portal/me-contact', 'update failed', {
      sub: claims.sub,
      schoolId: claims.schoolId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, contact: data });
}
