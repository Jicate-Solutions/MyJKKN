import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: staffId } = await params;
    // Add CORS headers to response
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    if (!staffId) {
      return NextResponse.json(
        { error: 'Staff ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

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
    console.log('[Staff Detail API] 1. Auth header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');
    console.log('[Staff Detail API] 2. Hashed key:', hashedKey);

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    console.log('[Staff Detail API] 3. Key verification:', {
      found: !!keyData,
      error: keyError?.message
    });

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check read permission
    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    console.log('[Staff Detail API] 4. Executing query for staff ID:', staffId);

    // Query for the specific staff member
    const { data: staff, error } = await supabase
      .from('staff')
      .select(
        `
        *,
        category:employment_categories(id, category_name),
        institution:institutions(id, name),
        department:departments(id, department_name)
        `
      )
      .eq('id', staffId)
      .single();

    console.log('[Staff Detail API] 5. Query result:', {
      success: !!staff,
      error: error?.message
    });

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Staff not found' },
          { status: 404, headers: corsHeaders }
        );
      }
      throw error;
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({ data: staff }, { headers: corsHeaders });
  } catch (error) {
    console.error('[Staff Detail API] Error fetching staff:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
