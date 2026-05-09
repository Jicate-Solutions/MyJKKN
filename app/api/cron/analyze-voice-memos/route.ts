// =====================================================================
// Voice Memo Analysis Pipeline — runs every 5 min via Vercel cron
// =====================================================================
// Sweeps `admission_call_logs` for memo_audio_url uploads in
// pending/failed status, runs them through OpenAI Whisper (forced
// English) → language guardrail → GPT-4o-mini sentiment + summary +
// categories → writes back to memo_* columns.
//
// EMPIRICAL CONTEXT (Director's Path A, 2026-05-09):
//   Counselors record 30-second English voice memos after each
//   admission lead call (personal phone, no Exotel call cost). At
//   ~6,680 memos/month, total OpenAI spend ≈ ₹2,200/mo.
//
//   Whisper Tamil accuracy is ~21% (Soniox benchmark) — effectively
//   garbage. Two-layer language guardrail rejects non-English audio
//   BEFORE GPT runs:
//     (a) Whisper response.language must equal 'en'.
//     (b) Transcript must not contain Tamil/Devanagari/Bengali/Arabic
//         unicode ranges (Whisper occasionally misclassifies as 'en'
//         when the audio is empty or has accented English).
//   Rejected memos land in status='rejected_non_english' and are
//   excluded from Lead Mood Digest aggregations.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query.
// Schedule: */5 * * * * (every 5 min).
// Required env: CRON_SECRET, OPENAI_API_KEY.
//
// Created: 2026-05-09 (Build #4 voice memo backend).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const BATCH_LIMIT = 20; // rate-limit Whisper API calls per run
const STORAGE_BUCKET = 'call-memos';

// Unicode regex ranges for non-Latin scripts that Whisper can mislabel as English.
// Tamil: U+0B80–U+0BFF, Devanagari: U+0900–U+097F, Bengali: U+0980–U+09FF,
// Arabic: U+0600–U+06FF, Telugu: U+0C00–U+0C7F, Kannada: U+0C80–U+0CFF,
// Malayalam: U+0D00–U+0D7F, Gujarati: U+0A80–U+0AFF, Gurmukhi: U+0A00–U+0A7F.
const NON_LATIN_REGEX =
  /[஀-௿ऀ-ॿঀ-৿؀-ۿఀ-౿ಀ-೿ഀ-ൿ઀-૿਀-੿]/;

interface MemoCandidate {
  id: string;
  institution_id: string;
  memo_audio_url: string;
}

interface AnalysisResult {
  sentiment: string;
  sentiment_score: number;
  summary: string;
  categories: string[];
}

// ============================================================================
// OPENAI HELPERS
// ============================================================================

async function transcribeWithWhisper(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  filename: string,
): Promise<{ text: string; language: string }> {
  const form = new FormData();
  // Whisper API requires a file. Wrap the buffer in a Blob.
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  form.append('file', blob, filename);
  form.append('model', 'whisper-1');
  form.append('language', 'en'); // force English
  form.append('response_format', 'verbose_json'); // gives us .language

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Whisper API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as { text?: string; language?: string };
  return {
    text: (data.text || '').trim(),
    language: (data.language || 'unknown').toLowerCase(),
  };
}

async function analyzeSentiment(
  transcript: string,
  apiKey: string,
): Promise<AnalysisResult> {
  const systemPrompt = `You analyze 30-second voice memos that admission counselors record after calling
prospective students. Extract structured sentiment data.

Return ONLY a JSON object with this exact shape:
{
  "sentiment": one of "positive" | "neutral" | "concerned" | "anxious" | "hostile",
  "sentiment_score": number from 0.0 (very negative) to 1.0 (very positive),
  "summary": 1-2 short sentences capturing the lead's state and key concern,
  "categories": array of 1-3 strings from this exact list: course_inquiry, fees_concern, hostel_concern, family_decision, scheduling, complaint, application_help, other
}

Be calibrated:
- positive (>=0.7): clear interest, ready to enroll, family aligned
- neutral (0.4-0.7): exploring, no objection, no commitment
- concerned (0.2-0.4): hesitant, has questions, fees/hostel/distance worries
- anxious (0.1-0.3): family pressure, deadline stress, financial uncertainty
- hostile (<0.2): rude, refusing, complaint about JKKN`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Transcript:\n\n${transcript}` },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`GPT API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('GPT returned empty content');

  const parsed = JSON.parse(content) as Partial<AnalysisResult>;
  // Defensive defaults — clamp + normalize.
  const sentiment =
    typeof parsed.sentiment === 'string' && parsed.sentiment.length > 0
      ? parsed.sentiment
      : 'neutral';
  const score =
    typeof parsed.sentiment_score === 'number'
      ? Math.max(0, Math.min(1, parsed.sentiment_score))
      : 0.5;
  const summary =
    typeof parsed.summary === 'string' && parsed.summary.length > 0
      ? parsed.summary.slice(0, 500)
      : '';
  const categories = Array.isArray(parsed.categories)
    ? (parsed.categories.filter((c) => typeof c === 'string' && c.length > 0) as string[]).slice(
        0,
        3,
      )
    : [];

  return { sentiment, sentiment_score: score, summary, categories };
}

// ============================================================================
// CRON HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  const started = Date.now();

  // --- Auth ---------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('[cron/analyze-voice-memos] OPENAI_API_KEY not set');
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not configured' },
      { status: 500 },
    );
  }

  const supabase = createServiceRoleClient();

  // --- Find candidates ---------------------------------------------
  // memo_audio_url IS NOT NULL AND status IN ('pending','failed')
  // Hits the partial index idx_admission_call_logs_memo_pending.
  const { data: candidatesRaw, error: candidatesErr } = await supabase
    .from('admission_call_logs')
    .select('id, institution_id, memo_audio_url')
    .not('memo_audio_url', 'is', null)
    .in('memo_analyze_status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (candidatesErr) {
    console.error('[cron/analyze-voice-memos] candidate query failed:', candidatesErr.message);
    return NextResponse.json({ ok: false, error: candidatesErr.message }, { status: 500 });
  }

  const candidates = (candidatesRaw || []) as MemoCandidate[];

  // --- Process -----------------------------------------------------
  let completed = 0;
  let rejected = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      // Mark transcribing (acts as a soft lock against another invocation).
      await supabase
        .from('admission_call_logs')
        .update({ memo_analyze_status: 'transcribing' })
        .eq('id', c.id);

      // Download audio from Supabase Storage.
      const { data: audioBlob, error: dlErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(c.memo_audio_url.replace(/^call-memos\//, ''));

      if (dlErr || !audioBlob) {
        throw new Error(`storage download: ${dlErr?.message || 'no blob'}`);
      }
      const audioBuffer = await audioBlob.arrayBuffer();

      // Whisper transcription.
      const { text: transcript, language } = await transcribeWithWhisper(
        audioBuffer,
        openaiKey,
        `${c.id}.webm`,
      );

      // Language guardrail:
      //   (a) Whisper response.language must be 'en'.
      //   (b) Transcript must not contain non-Latin scripts.
      const hasNonLatin = NON_LATIN_REGEX.test(transcript);
      if (language !== 'en' || hasNonLatin) {
        await supabase
          .from('admission_call_logs')
          .update({
            memo_transcript: transcript || null,
            memo_transcript_language: language,
            memo_analyze_status: 'rejected_non_english',
            memo_analyzed_at: new Date().toISOString(),
          })
          .eq('id', c.id);
        rejected++;
        continue;
      }

      // Empty transcript guard — Whisper sometimes returns nothing for silence.
      if (!transcript || transcript.length < 5) {
        await supabase
          .from('admission_call_logs')
          .update({
            memo_transcript: transcript || null,
            memo_transcript_language: language,
            memo_analyze_status: 'failed',
            memo_analyzed_at: new Date().toISOString(),
          })
          .eq('id', c.id);
        failed++;
        errors.push(`${c.id}: empty transcript`);
        continue;
      }

      // Move to analyzing.
      await supabase
        .from('admission_call_logs')
        .update({
          memo_transcript: transcript,
          memo_transcript_language: language,
          memo_analyze_status: 'analyzing',
        })
        .eq('id', c.id);

      // GPT-4o-mini sentiment + summary + categories.
      const analysis = await analyzeSentiment(transcript, openaiKey);

      await supabase
        .from('admission_call_logs')
        .update({
          memo_sentiment: analysis.sentiment,
          memo_sentiment_score: analysis.sentiment_score,
          memo_summary: analysis.summary,
          memo_categories: analysis.categories,
          memo_analyze_status: 'completed',
          memo_analyzed_at: new Date().toISOString(),
        })
        .eq('id', c.id);

      completed++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${c.id}: ${msg}`);
      try {
        await supabase
          .from('admission_call_logs')
          .update({
            memo_analyze_status: 'failed',
            memo_analyzed_at: new Date().toISOString(),
          })
          .eq('id', c.id);
      } catch {
        // best-effort — already in error path
      }
    }
  }

  // --- Remaining counter (visibility) -------------------------------
  let remaining: number | null = null;
  try {
    const { count } = await supabase
      .from('admission_call_logs')
      .select('id', { count: 'exact', head: true })
      .not('memo_audio_url', 'is', null)
      .in('memo_analyze_status', ['pending', 'failed']);
    remaining = count ?? null;
  } catch {
    /* non-fatal */
  }

  const durationMs = Date.now() - started;
  const processed = candidates.length;

  console.warn(
    '[cron/analyze-voice-memos] run-complete',
    JSON.stringify({
      ok: true,
      duration_ms: durationMs,
      processed,
      completed,
      rejected,
      failed,
      remaining,
      first_errors: errors.slice(0, 5),
    }),
  );

  return NextResponse.json({
    ok: true,
    duration_ms: durationMs,
    processed,
    completed,
    rejected,
    failed,
    remaining,
    errors: errors.slice(0, 10),
  });
}
