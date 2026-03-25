import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate — requires 'academic' module access
    const authResult = await authenticateApiKey(request, { requiredModule: 'academic' });
    if ('error' in authResult) return authResult.error;
    const { supabase } = authResult.context;

    const { id } = await params;

    // Fetch academic year by ID - select all fields
    const { data: academicYear, error } = await supabase
      .from('academic_years')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !academicYear) {
      return NextResponse.json(
        { error: 'Academic year not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json({ data: academicYear }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching academic year:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
