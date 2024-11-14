import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
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

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
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

    // Check RLS policies
    console.log('4. Checking RLS policies');

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401 }
      );
    }

    // Check read permission
    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403 }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    console.log('4. Query params:', Object.fromEntries(url.searchParams));

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const isActive = url.searchParams.get('isActive');

    // Build query
    let query = supabase.from('institutions').select('*', { count: 'exact' });

    console.log('5. Executing query...');

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: institutions, error, count } = await query;

    console.log('6. Query result:', {
      success: !!institutions,
      error: error?.message,
      count,
      firstRecord: institutions?.[0]
        ? {
            id: institutions[0].id,
            name: institutions[0].name
          }
        : null
    });

    if (error) throw error;

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json(
      {
        data: institutions || [],
        metadata: {
          total: count || 0,
          page: 1,
          limit: 10,
          totalPages: count ? Math.ceil(count / 10) : 0
        }
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching institutions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
