// lib/services/platform/ai-clients/transcription.ts
// ============================================================================
// Multi-provider audio-transcription dispatcher.
//
// Used by cron consumers (e.g. analyze-voice-memos) to swap providers
// without touching the cron handler. Both Groq and OpenAI expose an
// OpenAI-compatible /v1/audio/transcriptions endpoint, so the request body
// is identical — only the base URL and bearer token differ.
//
// Returns the same shape regardless of provider:
//   { text: string, language: string }
// ============================================================================

export type TranscriptionProvider = 'openai' | 'groq';

export interface TranscriptionResult {
  text: string;
  language: string;
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
  throw new Error(`Unsupported transcription provider: ${provider} (model_id=${modelId})`);
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

  const data = (await response.json()) as { text?: string; language?: string };
  return {
    text: (data.text || '').trim(),
    language: (data.language || 'unknown').toLowerCase(),
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
