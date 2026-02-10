import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { corsHeaders } from '@/lib/cors';
import { createHash } from 'crypto';


export async function GET(request: NextRequest) {
  try {
    // Add CORS headers to response
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Use service role key for API key authentication to bypass RLS
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() {
            return undefined;
          },
          set() {},
          remove() {}
        }
      }
    );

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    // Check RLS policies

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

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const isActive = url.searchParams.get('isActive');

    // Build query
    let query = supabase
      .from('institutions')
      .select('id, name, counselling_code');

    query = query.order('name');

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
    console.error('Error fetching institution names:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
