import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verify API key
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');

    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401 }
      );
    }

    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403 }
      );
    }

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

    if (institutionError) {
      if (institutionError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Institution not found' },
          { status: 404 }
        );
      }
      throw institutionError;
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json(institution);
  } catch (error) {
    console.error('Error fetching institution:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
