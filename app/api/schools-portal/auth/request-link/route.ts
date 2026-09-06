/**
 * POST /api/schools-portal/auth/request-link
 *
 * Issues a magic-link email to the supplied address IF that address is on
 * file as a portal-eligible school_contact (HM / principal). Responds with a
 * uniform { ok: true } shape regardless of whether the contact exists, to
 * prevent email-enumeration. In non-production (no RESEND_API_KEY) the link
 * is returned in `debugLink` so devs can complete the flow without email.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requestMagicLink } from '@/lib/services/schools-portal/magic-link';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = (body?.email ?? '').trim();
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent');
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;

  const result = await requestMagicLink({ email, userAgent, ip });

  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Uniform success shape — never reveal whether the email matched a
  // portal-eligible contact (no enumeration). debugLink is only set in
  // non-production when Resend is not configured.
  const debugLink =
    'debugLink' in result && result.debugLink ? result.debugLink : undefined;
  return NextResponse.json({
    ok: true,
    sent: true,
    ...(debugLink ? { debugLink } : {}),
  });
}
