// app/api/system/api-keys/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { CreateApiKeyInput } from '@/types/api-keys';
import crypto from 'crypto';

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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch API keys
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

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

    // Add these debug logs
    console.log('1. Request input:', input);

    // Check authentication
    const {
      data: { session },
      error: authError
    } = await supabase.auth.getSession();

    console.log('2. Auth session:', session ? 'Found' : 'Not found');
    console.log('Auth error:', authError);

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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate API key
    const prefix = 'jk';
    const randomString = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString(36);
    const plainTextKey = `${prefix}_${randomString}_${timestamp}`;

    // Hash the key for storage
    const hashedKey = crypto
      .createHash('sha256')
      .update(plainTextKey)
      .digest('hex');

    console.log('3. Generated key details:', {
      plainTextKey,
      hashedKeyLength: hashedKey.length
    });

    // Log the insert attempt
    console.log('4. Attempting to insert with data:', {
      name: input.name,
      keyLength: hashedKey.length,
      expires_at: input.expires_at,
      permissions: input.permissions
    });

    // Create API key record
    const { data: key, error } = await supabase
      .from('api_keys')
      .insert([
        {
          name: input.name,
          key_value: hashedKey,
          created_by: session.user.id,
          expires_at: input.expires_at || null,
          permissions: input.permissions || { read: true, write: false },
          is_active: true
        }
      ])
      .select()
      .single();

    console.log('5. Insert result:', {
      success: !!key,
      error: error?.message,
      keyId: key?.id
    });

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to create API key');
    }

    return NextResponse.json({ key, plainTextKey });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error'
      },
      { status: 500 }
    );
  }
}
