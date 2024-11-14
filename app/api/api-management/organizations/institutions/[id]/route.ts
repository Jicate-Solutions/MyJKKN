import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Add CORS headers to response
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore
    });

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');
    console.log('1. Auth header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');
    console.log('2. Hashed key:', hashedKey);

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    console.log('3. Key verification:', {
      found: !!keyData,
      error: keyError?.message,
      keyData: keyData
        ? {
            id: keyData.id,
            name: keyData.name,
            is_active: keyData.is_active,
            permissions: keyData.permissions
          }
        : null
    });

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    console.log('4. Fetching institution:', params.id);

    // Get institution with departments
    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .select(
        `
        *,
        departments:departments(*)
      `
      )
      .eq('id', params.id)
      .single();

    console.log('5. Query result:', {
      found: !!institution,
      error: institutionError?.message,
      departmentsCount: institution?.departments?.length || 0,
      institutionData: institution
        ? {
            id: institution.id,
            name: institution.name,
            code: institution.code
          }
        : null
    });

    if (institutionError) {
      if (institutionError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Institution not found' },
          { status: 404, headers: corsHeaders }
        );
      }
      throw institutionError;
    }

    console.log('6. Updating last used timestamp');

    // Update last used timestamp
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    if (updateError) {
      console.error('Error updating last used timestamp:', updateError);
    }

    return NextResponse.json(institution);
  } catch (error) {
    console.error('Error fetching institution:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
