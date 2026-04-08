

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/certificates — generate a certificate (calls pde_next_certificate_number RPC)
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { learner_id, course_id, final_score, completion_hours, finks_profile } = body;

    if (!learner_id || !course_id) {
      return NextResponse.json(
        { error: 'learner_id and course_id are required' },
        { status: 400 }
      );
    }

    // Generate certificate number via RPC, fallback to timestamp-based
    let certNumber: string;
    try {
      const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
        'pde_next_certificate_number'
      );
      if (rpcErr) throw rpcErr;
      certNumber = rpcResult;
    } catch {
      // Fallback if RPC doesn't exist yet
      certNumber = `JKKN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }

    const { data, error } = await (supabase as any)
      .from('pde_certificates')
      .insert({
        learner_id,
        course_id,
        certificate_number: certNumber,
        certificate_type: 'course_completion',
        final_score: final_score ?? null,
        completion_hours: completion_hours ?? null,
        finks_profile: finks_profile ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    console.error('Error generating certificate:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/pde/certificates?learnerId=xxx — list certificates for a learner
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const learnerId = searchParams.get('learnerId');

    if (!learnerId) {
      return NextResponse.json(
        { error: 'learnerId query param is required' },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase as any)
      .from('pde_certificates')
      .select('*')
      .eq('learner_id', learnerId)
      .order('issued_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching certificates:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
