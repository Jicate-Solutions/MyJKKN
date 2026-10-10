'use server';

// app/(routes)/admission/counselors/daily-view/_actions/callback-script.ts
// A short AI-drafted call script for one missed-call callback.
//
// A server action, not an API route: the app sits at Vercel's route budget, and
// this needs no URL of its own. Access is decided in the database —
// fn_callback_script_context raises 42501 unless the caller may work this callback
// (their own, an unclaimed one in their college, or a manager of that college).
// The session client is used so auth.uid() inside that function is the real caller.
// The model never sees the phone number. If the AI call fails, a plain template is
// returned so the counsellor can still call.

import { createClient } from '@/lib/supabase/server';
import { claudeChatForFeature } from '@/lib/services/platform/ai-clients/chat';
import {
  buildCallbackPrompt,
  fallbackCallbackScript,
  type CallbackScriptContext,
} from '@/lib/services/admission/callback-script';

const FEATURE_KEY = 'admission.callback_script';

export type CallbackScriptResult =
  | { ok: true; script: string; source: 'ai' | 'template' }
  | { ok: false; error: string };

export async function draftCallbackScript(callbackId: string): Promise<CallbackScriptResult> {
  if (typeof callbackId !== 'string' || !/^[0-9a-f-]{36}$/i.test(callbackId)) {
    return { ok: false, error: 'This callback could not be found.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const { data, error } = await (supabase as any).rpc('fn_callback_script_context', { p_id: callbackId });
  if (error) {
    return {
      ok: false,
      error: error.code === '42501' ? 'You cannot open this callback.' : 'Could not load this callback.',
    };
  }
  const ctx = (data ?? null) as CallbackScriptContext | null;
  if (!ctx) return { ok: false, error: 'This callback no longer exists.' };

  try {
    const { system, user: prompt } = buildCallbackPrompt(ctx);
    const { text } = await claudeChatForFeature(FEATURE_KEY, {
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const script = text.trim();
    if (!script) throw new Error('empty script');
    return { ok: true, script, source: 'ai' };
  } catch (err) {
    console.warn('[admission/callback-script] AI script failed, using template:', err instanceof Error ? err.message : err);
    return { ok: true, script: fallbackCallbackScript(ctx), source: 'template' };
  }
}
