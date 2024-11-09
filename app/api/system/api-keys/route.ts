// app/api/system/api-keys/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { CreateApiKeyInput, UpdateApiKeyInput } from '@/types/api-keys';
import toast from 'react-hot-toast';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { session },
      error: authError
    } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['super_admin', 'administrator'].includes(profile.role)
    ) {
      toast.error('You are not authorized to view API keys');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch API keys
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(keys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const input: CreateApiKeyInput = await request.json();

    // Check authentication
    const {
      data: { session },
      error: authError
    } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['super_admin', 'administrator'].includes(profile.role)
    ) {
      toast.error('You are not authorized to create an API key');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate API key (similar to service function but for server-side)
    const prefix = 'jk';
    const randomBytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(crypto.randomUUID())
    );
    const randomString = Array.from(new Uint8Array(randomBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);
    const timestamp = Date.now().toString(36);
    const plainTextKey = `${prefix}_${randomString}_${timestamp}`;

    // Hash the key for storage
    const keyHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(plainTextKey)
    );
    const hashedKey = Array.from(new Uint8Array(keyHash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Create API key
    const { data: key, error } = await supabase
      .from('api_keys')
      .insert({
        name: input.name,
        key_value: hashedKey,
        created_by: session.user.id,
        expires_at: input.expires_at || null,
        permissions: input.permissions || { read: true, write: false }
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ key, plainTextKey });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
