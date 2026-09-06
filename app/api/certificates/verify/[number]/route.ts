export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { resolveCertificate } from '@/lib/services/certificates/verify-resolver';

/**
 * GET /api/certificates/verify/[number] — PUBLIC (no auth).
 *
 * Canonical unified certificate-verification endpoint. Backs the public
 * `/verify/[number]` page and every certificate's `verification_url`. Resolves
 * across all certificate types and returns ONLY the whitelisted public fields
 * (see verify-resolver.ts for the security model).
 *
 * Responses:
 *   200 { valid:true,  status:'valid',     data }   — active certificate
 *   200 { valid:false, status:'cancelled', data }   — revoked certificate
 *   404 { valid:false, status:'not_found' }         — no such certificate
 *   500 { valid:false, status:'error' }             — lookup failed
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

    if (result.status === 'not_found') {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[certificates/verify] lookup failed:', error);
    return NextResponse.json(
      { valid: false, status: 'error', error: 'Verification failed' },
      { status: 500 }
    );
  }
}
