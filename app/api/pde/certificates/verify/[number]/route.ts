export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { resolveCertificate } from '@/lib/services/certificates/verify-resolver';

/**
 * GET /api/pde/certificates/verify/[number] — PUBLIC (no auth). LEGACY PATH.
 *
 * Delegates to the unified verify resolver (see app/api/certificates/verify).
 * Kept for backward compatibility with any previously-printed QR codes that
 * encode this path. Returns the SAME whitelisted public shape as the canonical
 * endpoint — name + title + issue date + status only. It no longer returns
 * scores/hours/competencies (that grade-leaking behaviour was removed on
 * 2026-07-06; it was latent only because the table was empty).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  await connection();
  try {
    const { number } = await params;
    if (!number) {
      return NextResponse.json(
        { valid: false, status: 'not_found', error: 'Certificate number is required' },
        { status: 400 }
      );
    }

    const result = await resolveCertificate(number);
    return NextResponse.json(result, {
      status: result.status === 'not_found' ? 404 : 200,
    });
  } catch (error: any) {
    console.error('[pde/certificates/verify] lookup failed:', error);
    return NextResponse.json(
      { valid: false, status: 'error', error: 'Verification failed' },
      { status: 500 }
    );
  }
}
