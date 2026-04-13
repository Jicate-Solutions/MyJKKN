/**
 * Public Document Verification API
 * GET /api/documents/verify?code=XXXXXXXX
 * No auth required — anyone with a code can verify.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DocumentAuditService } from '@/lib/services/document-audit-service';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Missing verification code' }, { status: 400 });
  }

  const doc = await DocumentAuditService.verifyByCode(code);
  if (!doc) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({ found: true, document: doc });
}
