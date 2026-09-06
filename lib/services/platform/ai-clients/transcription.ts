// lib/services/platform/ai-clients/transcription.ts
// ============================================================================
// Multi-provider audio-transcription dispatcher.
//
// Used by cron consumers (e.g. analyze-voice-memos) to swap providers
// without touching the cron handler. Groq and OpenAI expose an
// OpenAI-compatible /v1/audio/transcriptions endpoint, so the request body
// is identical — only the base URL and bearer token differ. Sarvam exposes
// its own form-encoded endpoint with an api-subscription-key header.
//
// Returns the same shape regardless of provider:
//   { text: string, language: string, durationSeconds: number | null }
//
// `language` is always normalized to an ISO 639-1 code (e.g. 'en') — never a
// full-word language name like 'English'. Whisper-verbose-json returns
// `language: "English"` (capital E, full word); this dispatcher folds that
// into `'en'` at source so downstream language guardrails can do a simple
// `=== 'en'` compare.
//
// `durationSeconds` comes from Whisper's verbose_json `duration` field — needed
// for accurate per-call cost estimation. Null when the provider doesn't return
// it (Sarvam currently; future-OpenAI without verbose_json).
// ============================================================================

export type TranscriptionProvider = 'openai' | 'groq' | 'sarvam';

export interface TranscriptionResult {
  text: string;
  language: string;
  /** Audio duration in seconds, parsed from the provider's verbose_json
   *  `duration` field. Null when the provider response omits it. Needed by
   *  estimateTranscriptionCostInr — without it, every transcription cost row
   *  is recorded as null and the admin Cost panel reports ₹0 even when
   *  thousands of calls fire (the bug this field was added to fix). */
  durationSeconds: number | null;
}

interface TranscribeArgs {
  audioBuffer: ArrayBuffer;
  filename: string;
  provider: string;
  modelId: string;
  /** Force a target language (ISO 639-1). Defaults to 'en' for the voice-memo pipeline. */
  language?: string;
  /** MIME type for the wrapped Blob — Whisper API uses this to pick a decoder. */
  mimeType?: string;
}

/**
 * Dispatch a transcription call to the configured provider.
 * Throws on non-2xx response with a truncated error body.
 */
export async function transcribeAudio(args: TranscribeArgs): Promise<TranscriptionResult> {
  const { provider, modelId } = args;

  if (provider === 'groq') {
    return transcribeViaGroq(args);
  }
  if (provider === 'openai') {
    return transcribeViaOpenAI(args);
  }
  if (provider === 'sarvam') {
    return transcribeViaSarvam(args);
  }
  throw new Error(`Unsupported transcription provider: ${provider} (model_id=${modelId})`);
}

// ============================================================================
// Language normalization
// ============================================================================
//
// Whisper-verbose-json returns `language: "English"` (full word, capital E).
// Sarvam returns `language_code: "en-IN"` (BCP-47 with region). The voice-memo
// cron compares `language !== 'en'` to gate non-English audio. Folding all
// shapes into ISO 639-1 at source keeps that compare a one-liner and prevents
// silent rejections of valid English memos (root cause of the 100%-rejection
// bug observed 2026-05-22).
const LANGUAGE_NAME_TO_ISO: Record<string, string> = {
  english: 'en',
  tamil: 'ta',
  hindi: 'hi',
  bengali: 'bn',
  telugu: 'te',
  kannada: 'kn',
  malayalam: 'ml',
  gujarati: 'gu',
  marathi: 'mr',
  punjabi: 'pa',
  urdu: 'ur',
  arabic: 'ar',
};

export function normalizeLanguageCode(raw: string | undefined | null): string {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase().trim();
  // BCP-47 regional code like "en-in", "en-us" → "en"
  if (lower.includes('-')) {
    const base = lower.split('-')[0];
    return LANGUAGE_NAME_TO_ISO[base] ?? base;
  }
  // Full-word language name like "english" → "en"
  if (LANGUAGE_NAME_TO_ISO[lower]) {
    return LANGUAGE_NAME_TO_ISO[lower];
  }
  return lower;
}

async function transcribeViaGroq(args: TranscribeArgs): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }
  return openaiCompatibleTranscribe({
    ...args,
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    apiKey,
  });
}

async function transcribeViaOpenAI(args: TranscribeArgs): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return openaiCompatibleTranscribe({
    ...args,
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    apiKey,
  });
}

interface CompatArgs extends TranscribeArgs {
  endpoint: string;
  apiKey: string;
}

async function openaiCompatibleTranscribe(args: CompatArgs): Promise<TranscriptionResult> {
  const {
    audioBuffer,
    filename,
    modelId,
    language = 'en',
    mimeType = 'audio/webm',
    endpoint,
    apiKey,
  } = args;

  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  form.append('file', blob, filename);
  form.append('model', modelId);
  form.append('language', language);
  form.append('response_format', 'verbose_json');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Transcription API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    text?: string;
    language?: string;
    duration?: number;
  };
  // verbose_json on both OpenAI and Groq Whisper returns `duration` in seconds
  // (float). Coerce defensively — a non-number means we record null and the cost
  // estimator skips this row rather than recording a wrong value.
  const rawDuration = data.duration;
  const durationSeconds =
    typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0
      ? rawDuration
      : null;
  return {
    text: (data.text || '').trim(),
    language: normalizeLanguageCode(data.language),
    durationSeconds,
  };
}

// ============================================================================
// Sarvam provider — Indian-language specialist (saarika:v2.5)
// ============================================================================
//
// API shape verified live 2026-05-22:
//   POST https://api.sarvam.ai/speech-to-text
//   Headers: api-subscription-key: <SARVAM_API_KEY>
//   Form fields: file (Blob), model (e.g. "saarika:v2.5"), language_code
//     (e.g. "unknown" for auto-detect, or "en-IN" / "ta-IN" to force)
//   Response: { request_id, transcript, language_code }
//     language_code is BCP-47 ("en-IN", "ta-IN") — normalized to ISO via
//     normalizeLanguageCode() so downstream guardrails see plain "en"/"ta".
//
// Note on cost tracking: Sarvam's response does NOT include audio duration,
// so we return durationSeconds=null. The cost estimator skips the row rather
// than recording a wrong cost. Director can wire duration via the audio
// metadata pre-upload if exact per-call Sarvam cost becomes required.
async function transcribeViaSarvam(args: TranscribeArgs): Promise<TranscriptionResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error('SARVAM_API_KEY not configured');
  }

  const {
    audioBuffer,
    filename,
    modelId,
    language = 'en',
    mimeType = 'audio/webm',
  } = args;

  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  form.append('file', blob, filename);
  form.append('model', modelId);
  // Sarvam expects either an explicit BCP-47 code ("en-IN") or "unknown" for
  // auto-detect. Map plain ISO ("en") to "en-IN" (the only English variant
  // Sarvam supports); pass through anything that already looks BCP-47 or is
  // the literal "unknown" sentinel.
  const sarvamLang =
    language === 'unknown'
      ? 'unknown'
      : language.includes('-')
        ? language
        : language === 'en'
          ? 'en-IN'
          : `${language}-IN`;
  form.append('language_code', sarvamLang);

  const response = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey },
    body: form,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Sarvam transcription API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    request_id?: string;
    transcript?: string;
    language_code?: string;
  };
  return {
    text: (data.transcript || '').trim(),
    language: normalizeLanguageCode(data.language_code),
    durationSeconds: null,
  };
}

/**
 * Estimate INR cost for a transcription call given the audio duration.
 * Pricing reference: lib/services/platform/ai-providers.ts (perMinuteInr).
 * Caller passes durationSeconds from Whisper response or audio metadata; if
 * unknown, omit and the function returns null (cost not recorded).
 */
export function estimateTranscriptionCostInr(
  perMinuteInr: number | undefined,
  durationSeconds: number | null,
): number | null {
  if (perMinuteInr == null || durationSeconds == null || durationSeconds <= 0) {
    return null;
  }
  return Number(((durationSeconds / 60) * perMinuteInr).toFixed(6));
}
