// lib/services/platform/ai-clients/sentiment.ts
// ============================================================================
// Multi-provider sentiment / structured-extraction dispatcher.
//
// The cron passes the same "system + user" prompt and expects the same
// JSON shape back. Each provider branch handles the wire format:
//   - openai: /v1/chat/completions with { messages, response_format: json_object }
//   - google: /v1beta/models/<id>:generateContent with systemInstruction +
//             contents + responseMimeType: application/json
//
// Returns the parsed JSON object exactly as the consumer expects (no
// provider-specific wrapping). Caller validates / clamps the shape.
// ============================================================================

export type SentimentProvider = 'openai' | 'google';

export interface SentimentArgs {
  /** Resolved provider slug from ai_model_config.provider. */
  provider: string;
  /** Resolved model id from ai_model_config.model_id. */
  modelId: string;
  /** System prompt — defines the JSON contract the model must return. */
  systemPrompt: string;
  /** User payload — typically the transcript or context text. */
  userPrompt: string;
  /** Optional sampling temperature. Defaults to 0.2 for deterministic JSON. */
  temperature?: number;
}

export interface SentimentRawResult {
  /** Parsed JSON object as returned by the model. Shape is consumer-defined. */
  parsed: Record<string, unknown>;
  /** Token counts (best-effort — providers report differently). */
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Dispatch a structured-extraction call to the configured provider.
 * Throws on non-2xx response or unparseable content.
 */
export async function analyzeStructured(args: SentimentArgs): Promise<SentimentRawResult> {
  const { provider } = args;

  if (provider === 'google') {
    return analyzeViaGoogle(args);
  }
  if (provider === 'openai') {
    return analyzeViaOpenAI(args);
  }
  throw new Error(`Unsupported sentiment provider: ${provider}`);
}

// ---------------------------------------------------------------------------
// OpenAI — chat completions with JSON object response_format
// ---------------------------------------------------------------------------

async function analyzeViaOpenAI(args: SentimentArgs): Promise<SentimentRawResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { modelId, systemPrompt, userPrompt, temperature = 0.2 } = args;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      response_format: { type: 'json_object' },
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty content');

  const parsed = JSON.parse(content) as Record<string, unknown>;
  return {
    parsed,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

// ---------------------------------------------------------------------------
// Google Gemini — generateContent with systemInstruction + responseMimeType
// ---------------------------------------------------------------------------

async function analyzeViaGoogle(args: SentimentArgs): Promise<SentimentRawResult> {
  // Accept either GOOGLE_API_KEY or GOOGLE_GENAI_API_KEY (legacy alias).
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY (or GOOGLE_GENAI_API_KEY) not configured');
  }

  const { modelId, systemPrompt, userPrompt, temperature = 0.2 } = args;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Google API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Google returned empty content');

  const parsed = JSON.parse(text) as Record<string, unknown>;
  return {
    parsed,
    inputTokens: data.usageMetadata?.promptTokenCount ?? null,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
  };
}

/**
 * Estimate INR cost for a chat / structured-extraction call.
 * Returns null if any required pricing input is missing.
 */
export function estimateChatCostInr(
  inputPer1KTokensInr: number | undefined,
  outputPer1KTokensInr: number | undefined,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (
    inputPer1KTokensInr == null ||
    outputPer1KTokensInr == null ||
    inputTokens == null ||
    outputTokens == null
  ) {
    return null;
  }
  const cost =
    (inputTokens / 1000) * inputPer1KTokensInr +
    (outputTokens / 1000) * outputPer1KTokensInr;
  return Number(cost.toFixed(6));
}
