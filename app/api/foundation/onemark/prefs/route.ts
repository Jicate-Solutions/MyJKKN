export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_ONEMARK_LOCALE,
  ONEMARK_LOCALES,
  isOneMarkLocale,
  toOneMarkLocale,
} from '@/lib/onemark/i18n';

// OneMark — the signed-in person's own interface preferences.
//
// GET /api/foundation/onemark/prefs
//   -> { uiLocale: 'en' | 'ta', persisted: boolean, reason?: 'schema_pending' }
// PUT /api/foundation/onemark/prefs  { uiLocale: 'en' | 'ta' }
//   -> { uiLocale, persisted: true }
//
// Decision 5: each person picks their own interface language. Ruling 5 of
// 2026-09-06 scopes this wave to learner surfaces; the preference itself is
// global to OneMark and outlives that scope.
//
// SESSION CLIENT ONLY. onemark_user_prefs' three policies are all
// `user_id = auth.uid()`, so RLS is the whole boundary: a person can read and
// write exactly one row, their own, and there is nothing here worth a
// service-role key. No permission key is checked either — an interface
// language is not an authorisation question, and gating it behind
// foundation.practice.take would lock out the very Senior Learners the next
// wave hands the wizard to.
//
// SCHEMA-PENDING BY DESIGN. onemark_user_prefs arrives with Lane S3's
// migration (20260919120000), which the coordinator applies before merge. Until
// then PostgREST answers 42P01 / PGRST205, and this route must not 500 the
// learner home: GET reports English with persisted:false, and PUT reports 503
// with the same shape so the browser keeps the choice locally and stops
// retrying. The product works today and starts remembering the day the table
// lands, with no second deploy.

const TABLE = 'onemark_user_prefs';

/** The migration has not been applied in this environment (or PostgREST has not
 *  refreshed its cache yet). Not an error the caller can act on. */
function isSchemaPending(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || code === '42703') {
    return true;
  }
  return /relation .* does not exist|could not find the table/i.test(error.message ?? '');
}

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select('ui_locale')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      if (isSchemaPending(error)) {
        return NextResponse.json({
          uiLocale: DEFAULT_ONEMARK_LOCALE,
          persisted: false,
          reason: 'schema_pending',
        });
      }
      // RLS denial or a genuine read failure. Say so rather than pretending the
      // person chose English (CLAUDE.md #27).
      return NextResponse.json(
        { error: 'Could not read your interface language.', detail: error.message },
        { status: 500 },
      );
    }

    // No row yet is the normal state for anyone who has never touched the
    // switch, and it means English — not an error.
    return NextResponse.json({
      uiLocale: toOneMarkLocale(data?.ui_locale),
      persisted: Boolean(data),
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not read your interface language.', detail: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { uiLocale?: unknown; ui_locale?: unknown }
      | null;
    // Accept either spelling: the browser sends uiLocale, the column is
    // ui_locale, and a curl written against the schema should not 400.
    const wanted = body?.uiLocale ?? body?.ui_locale;
    if (!isOneMarkLocale(wanted)) {
      return NextResponse.json(
        { error: `uiLocale must be one of ${ONEMARK_LOCALES.join(', ')}` },
        { status: 400 },
      );
    }

    // user_id is taken from the session, never from the body — the insert
    // policy would refuse another id anyway, and not accepting one at all means
    // there is nothing to refuse.
    const { data, error } = await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, ui_locale: wanted }, { onConflict: 'user_id' })
      .select('ui_locale')
      .maybeSingle();

    if (error) {
      if (isSchemaPending(error)) {
        return NextResponse.json(
          {
            error: 'The interface-language store is not live yet.',
            reason: 'schema_pending',
            uiLocale: wanted,
            persisted: false,
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: 'Could not save your interface language.', detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      uiLocale: toOneMarkLocale(data?.ui_locale ?? wanted),
      persisted: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not save your interface language.', detail: (e as Error).message },
      { status: 500 },
    );
  }
}
