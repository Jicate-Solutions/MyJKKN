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

    // Fetch batch by ID - select all fields
    const { data: batch, error } = await supabase
      .from('batches')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json({ data: batch }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching batch:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
