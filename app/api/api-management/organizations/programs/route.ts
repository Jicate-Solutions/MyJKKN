import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';
import { hashApiKey } from '@/lib/api-keys/api-key-service';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    console.log('Received GET request');

    // Add CORS headers to response
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore
    });

    console.log('Created Supabase client');

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('API key is missing or invalid');
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    console.log('API Key provided:', apiKey ? 'Yes' : 'No');

    if (!apiKey) {
      console.log('No API key provided');
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Hash the API key
    console.log('Hashing API key...');
    const hashedKey = await hashApiKey(apiKey);
    console.log('Hashed API key generated');

    // Verify API key
    console.log('Verifying API key:', apiKey.substring(0, 4) + '...');
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    console.log('API key verification result:', keyData ? 'Valid' : 'Invalid');
    console.log('API key error:', keyError);
    
    // Debug: Check if we can find the key in the database without filters
    const { data: allKeys, error: allKeysError } = await supabase
      .from('api_keys')
      .select('id, name, key_value, is_active')
      .eq('key_value', hashedKey);
      
    console.log('All matching keys:', allKeys);
    console.log('All keys error:', allKeysError);

    if (keyError || !keyData) {
      console.log('Invalid API key');
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      console.log('API key has expired');
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if the API key has permission to access programs
    console.log('Checking API key permissions');
    const permissions = keyData.permissions || [];
    
    // Check if permissions is an array or an object
    let hasReadPermission = false;
    if (Array.isArray(permissions)) {
      hasReadPermission = permissions.includes('read');
    } else if (typeof permissions === 'object') {
      hasReadPermission = permissions.read === true;
    }
    
    if (!hasReadPermission) {
      console.log('API key does not have read permission. Permissions:', permissions);
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get query parameters
    const url = new URL(request.url);

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const institutionId = url.searchParams.get('institution_id');
    const degreeId = url.searchParams.get('degree_id');
    const departmentId = url.searchParams.get('department_id');
    const isActive = url.searchParams.get('isActive');

    console.log('Query parameters:', { page, limit, search, institutionId, degreeId, departmentId, isActive });

    try {
      // Create a new Supabase client with the API key in the headers
      // This approach uses the createClient method which allows us to set global headers
      const { createClient } = await import('@supabase/supabase-js');
      
      // Get the Supabase URL and anon key from the environment
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      console.log('Supabase URL and anon key available:', !!supabaseUrl && !!supabaseAnonKey);
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase URL or anon key is missing');
      }
      
      // Create a custom Supabase client with the API key in the headers
      const supabaseWithApiKey = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'x-api-key': hashedKey
          }
        },
        db: {
          schema: 'public'
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      
      console.log('Custom Supabase client created with API key in headers');
      
      // Log the headers being sent
      console.log('Headers being sent:', {
        'apikey': '***' + supabaseAnonKey.substring(supabaseAnonKey.length - 4),
        'Authorization': 'Bearer ***',
        'x-api-key': hashedKey.substring(0, 8) + '...'
      });
      
      // Test RLS policy with a simple query first
      console.log('Testing RLS policy with API key');
      try {
        const { data: testData, error: testError } = await supabaseWithApiKey
          .from('programs')
          .select('count')
          .limit(1);
          
        if (testError) {
          console.error('RLS policy test failed:', testError);
          throw new Error(`RLS policy test failed: ${testError.message}`);
        }
        
        console.log('RLS policy test succeeded:', testData);
      } catch (testError: unknown) {
        console.error('Error testing RLS policy:', testError);
        throw new Error(`RLS policy test error: ${testError instanceof Error ? testError.message : String(testError)}`);
      }
      
      // Create a direct database connection with the API key in the header
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      
      console.log('Pagination range:', { from, to });

      // Build query with proper filters
      console.log('Building query for programs table');
      let query = supabaseWithApiKey
        .from('programs')
        .select(
          `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          ),
          degree:degrees (
            id,
            degree_id,
            degree_name
          ),
          department:departments (
            id,
            department_code,
            department_name
          )
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (search) {
        console.log('Applying search filter:', search);
        query = query.or(
          `program_id.ilike.%${search}%,program_name.ilike.%${search}%`
        );
      }

      if (institutionId) {
        console.log('Applying institution filter:', institutionId);
        query = query.eq('institution_id', institutionId);
      }

      if (degreeId) {
        console.log('Applying degree filter:', degreeId);
        query = query.eq('degree_id', degreeId);
      }

      if (departmentId) {
        console.log('Applying department filter:', departmentId);
        query = query.eq('department_id', departmentId);
      }

      if (isActive !== null) {
        console.log('Applying active status filter:', isActive);
        query = query.eq('is_active', isActive === 'true');
      }

      // Apply pagination
      query = query.range(from, to).order('created_at', { ascending: false });
      console.log('Pagination and ordering applied');

      // Execute query
      console.log('Executing query');
      const { data: programs, error, count } = await query;
      
      if (error) {
        console.error('Query execution error:', error);
        throw error;
      }
      
      console.log('Query executed successfully. Programs count:', programs?.length);

      // Update last used timestamp
      console.log('Updating last_used_at timestamp for API key');
      const updateResult = await supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id);
        
      if (updateResult.error) {
        console.error('Error updating last_used_at timestamp:', updateResult.error);
      } else {
        console.log('last_used_at timestamp updated successfully');
      }

      // Add the API key to the response headers to ensure it's passed to Supabase
      const responseHeaders = {
        ...corsHeaders,
        'apikey': hashedKey
      };
      
      console.log('Preparing response with programs data');
      return NextResponse.json({
        data: programs || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      }, { headers: responseHeaders });
    } catch (innerError: unknown) {
      console.error('Error in Supabase operations:', innerError);
      throw new Error(`Supabase operation failed: ${innerError instanceof Error ? innerError.message : String(innerError)}`);
    }
  } catch (error: unknown) {
    console.error('Error fetching programs:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}
