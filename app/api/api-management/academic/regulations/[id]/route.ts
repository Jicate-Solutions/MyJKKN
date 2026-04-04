export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    // Authenticate — requires 'academic' module access
    const authResult = await authenticateApiKey(request, { requiredModule: 'academic' });
    if ('error' in authResult) return authResult.error;
    const { supabase } = authResult.context;

    const { id } = await params;

    // Fetch regulation by ID - select all fields
    const { data: regulation, error } = await supabase
      .from('regulations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !regulation) {
      return NextResponse.json(
        { error: 'Regulation not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json({ data: regulation }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching regulation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
