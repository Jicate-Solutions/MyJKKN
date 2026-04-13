/**
 * Public Document Verification API
 * GET /api/documents/verify?code=XXXXXXXX
 * No auth required — anyone can verify a document by its code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'Missing verification code' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('generated_documents' as any)
      .select(`
        id, document_type, category, document_number, title, status,
        generated_at, verification_code, revoked_at, revoke_reason,
        learner_id, institution_id
      `)
      .eq('verification_code', code)
      .single();

    if (error || !data) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    // Fetch learner name if available
    let learner = null;
    if (data.learner_id) {
      const { data: learnerData } = await supabase
        .from('learners_profiles')
        .select('first_name, last_name, roll_number')
        .eq('id', data.learner_id)
        .single();
      learner = learnerData;
    }

    // Fetch institution name if available
    let institution = null;
    if (data.institution_id) {
      const { data: instData } = await supabase
        .from('institutions')
        .select('name')
        .eq('id', data.institution_id)
        .single();
      institution = instData;
    }

    return NextResponse.json({
      found: true,
      document: {
        ...data,
        learner,
        institution,
      },
    });
  } catch (error) {
    console.error('[documents/verify] Error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
