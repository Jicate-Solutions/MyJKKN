// lib/api/api-middleware.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const getClientIp = (request: NextRequest): string => {
  // Try to get IP from x-forwarded-for header
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, get the first one
    return forwardedFor.split(',')[0].trim();
  }

  // Try to get IP from x-real-ip header
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // If no headers are available, return a placeholder
  return 'unknown';
};

export async function validateApiKey(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return {
        error: 'Missing API key',
        status: 401
      };
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Check if API key exists and is active
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', apiKey)
      .eq('is_active', true)
      .single();

    if (keyError || !keyData) {
      return {
        error: 'Invalid API key',
        status: 401
      };
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return {
        error: 'API key has expired',
        status: 401
      };
    }

    // Get client IP
    const clientIp = getClientIp(request);

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // Log API usage
    await supabase.from('api_key_logs').insert({
      api_key_id: keyData.id,
      endpoint: request.nextUrl.pathname,
      method: request.method,
      status_code: 200,
      ip_address: clientIp,
      user_agent: request.headers.get('user-agent') || 'unknown'
    });

    return {
      success: true,
      userId: keyData.user_id,
      keyData,
      clientIp // Include the client IP in the return data if needed
    };
  } catch (error) {
    console.error('API key validation error:', error);
    return {
      error: 'Error validating API key',
      status: 500
    };
  }
}

// Helper type for API responses
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
};

// Helper function to create API responses
export function createApiResponse<T>(
  data?: T,
  error?: string,
  status: number = error ? 400 : 200
): ApiResponse<T> {
  return {
    success: !error,
    data,
    error,
    status
  };
}
