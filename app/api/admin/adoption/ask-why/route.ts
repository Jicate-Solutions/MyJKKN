// app/api/admin/adoption/ask-why/route.ts
//
// POST /api/admin/adoption/ask-why — ask the people who never used a feature
// why not.
//
// This route SENDS SOMETHING TO REAL PEOPLE. One tap here puts a must-answer
// question in front of every intended person with zero usage. That is why the
// guard rails live in the database, where they cannot be skipped by a caller:
// fn_adoption_ask_why refuses a feature younger than 14 days, asks a person at
// most once per feature ever, and never within 7 days of any other adoption
// question to that same person. The route adds no targeting of its own — it
// passes a feature key and nothing else.
//
// The returned `asked` count is the number of people who were sent the
// question. Zero is a normal, successful answer: everyone intended has either
// used the feature, been asked before, or was asked about something else this
// week.

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request) {
  await connection();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to send the question.' },
      { status: 401, headers: NO_STORE }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'The request body was not readable.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const featureKey = typeof body?.feature_key === 'string' ? body.feature_key.trim() : '';
  if (!featureKey) {
    return NextResponse.json(
      { error: 'A feature key is required.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const { data, error } = await supabase.rpc('fn_adoption_ask_why', {
    p_feature_key: featureKey,
  });

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'Sending the question is for super administrators only.' },
        { status: 403, headers: NO_STORE }
      );
    }
    console.error('[admin/adoption/ask-why] rpc failed', { featureKey, error });
    return NextResponse.json(
      { error: 'The question could not be sent.' },
      { status: 500, headers: NO_STORE }
    );
  }

  const result = (data ?? {}) as {
    success?: boolean;
    error?: string;
    asked?: number;
    notification_id?: string | null;
  };

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'The question was not sent.' },
      { status: 400, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      asked: result.asked ?? 0,
      notification_id: result.notification_id ?? null,
    },
    { headers: NO_STORE }
  );
}
