export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import {
  resolveChatModel,
  recordChatCall,
} from '@/lib/services/platform/ai-clients/chat';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

// Model resolves at runtime from ai_model_config (feature_key below);
// resolveChatModel never throws — hardcoded fallback on any config failure.
const FEATURE_KEY = 'work_pulse.translate';


// Tamil Unicode range
const TAMIL_REGEX = /[\u0B80-\u0BFF]/;

/** Detect if text contains Tamil characters (>30% threshold) */
function isTamilText(text: string): boolean {
  if (!text) return false;
  const tamilChars = text.split('').filter((c) => TAMIL_REGEX.test(c)).length;
  return tamilChars / text.length > 0.3;
}

/** Tamil→English translation via Claude + optional DB update */
export async function POST(request: NextRequest) {
  await connection();

  // Auth: any authenticated user
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ANTHROPIC_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured — translation unavailable' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { text, pulse_entry_id, field } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // Check if Tamil
    if (!isTamilText(text)) {
      return NextResponse.json({
        translated: false,
        reason: 'Text does not appear to be Tamil',
        original: text,
      });
    }

    // Model from ai_model_config — resolved after the Tamil-detection
    // short-circuit so non-Tamil requests never touch config. Never throws.
    const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

    // Translate via Claude Haiku (cost-efficient)
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const aiStartedAt = Date.now();
    let message;
    try {
      message = await anthropic.messages.create({
        model: modelId,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Translate the following Tamil text to English. Preserve the meaning and context. Return ONLY the English translation, nothing else.\n\nTamil text: ${text}`,
          },
        ],
      });
    } catch (aiErr) {
      // Record the failed invocation (internally non-throwing), then rethrow —
      // the outer catch keeps the existing 500 response.
      await recordChatCall(FEATURE_KEY, 'anthropic', modelId, aiStartedAt, null, aiErr);
      throw aiErr;
    }
    await recordChatCall(FEATURE_KEY, 'anthropic', modelId, aiStartedAt, message);

    const content = message.content[0];
    const translation = content.type === 'text' ? content.text.trim() : '';

    // Optionally update the DB _en column
    if (pulse_entry_id && field) {
      const validFields = ['talent_waste_description_en', 'repetition_description_en'];
      if (validFields.includes(field)) {
        const supabase = createServiceRoleClient();
        await supabase
          .from('wp_pulse_entries')
          .update({ [field]: translation })
          .eq('id', pulse_entry_id);
      }
    }

    return NextResponse.json({
      translated: true,
      original: text,
      english: translation,
    });
  } catch (error) {
    console.error('[work-pulse/translate]', error);
    return NextResponse.json(
      { error: 'Translation failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
