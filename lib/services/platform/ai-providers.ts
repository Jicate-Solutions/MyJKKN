// lib/services/platform/ai-providers.ts
// ============================================================================
// AI Provider / Model Registry — static reference used by the admin UI picker.
//
// WHY: /admin/ai-models lets super_admin pick provider + model per feature.
// This registry tells the picker which models exist per provider and what each
// roughly costs, so Director can make informed cost-vs-quality choices.
//
// Pricing is in INR per 1000 tokens (input/output) for chat models, OR in INR
// per minute for audio models. Numbers reflect public provider list pricing
// converted at ~₹85/USD as of 2026-05. Update when providers change pricing.
// These are reference figures — actual cost is captured per-call in
// ai_model_usage.cost_inr by the consumer service.
// ============================================================================

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'sarvam'
  | 'whisper';

export interface ModelOption {
  id: string;
  label: string;
  // Pricing in INR. Either per-token OR per-minute is set, never both.
  inputPer1KTokensInr?: number;
  outputPer1KTokensInr?: number;
  perMinuteInr?: number;
  modality: 'chat' | 'audio_transcription' | 'audio_tts';
  notes?: string;
}

export interface ProviderRegistryEntry {
  id: ProviderId;
  label: string;
  envVarHint: string; // env var name that powers this provider in production
  models: ModelOption[];
}

export const AI_PROVIDER_REGISTRY: ProviderRegistryEntry[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    envVarHint: 'OPENAI_API_KEY',
    models: [
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o mini (cheap, fast)',
        inputPer1KTokensInr: 0.013,
        outputPer1KTokensInr: 0.05,
        modality: 'chat',
        notes: 'Default for most MyJKKN AI features. Good balance of cost and quality.',
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4o (higher quality, more expensive)',
        inputPer1KTokensInr: 0.21,
        outputPer1KTokensInr: 0.85,
        modality: 'chat',
      },
      {
        id: 'gpt-4.1-mini',
        label: 'GPT-4.1 mini',
        inputPer1KTokensInr: 0.034,
        outputPer1KTokensInr: 0.136,
        modality: 'chat',
      },
      {
        id: 'whisper-1',
        label: 'Whisper-1 (audio transcription)',
        perMinuteInr: 0.51,
        modality: 'audio_transcription',
        notes: 'English-only is reliable. Tamil accuracy ~21% (Soniox benchmark).',
      },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    envVarHint: 'ANTHROPIC_API_KEY',
    models: [
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5 (cheap, fast)',
        inputPer1KTokensInr: 0.085,
        outputPer1KTokensInr: 0.425,
        modality: 'chat',
      },
      {
        id: 'claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        inputPer1KTokensInr: 0.255,
        outputPer1KTokensInr: 1.275,
        modality: 'chat',
      },
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7 (highest quality)',
        inputPer1KTokensInr: 1.275,
        outputPer1KTokensInr: 6.375,
        modality: 'chat',
      },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    envVarHint: 'GOOGLE_GENAI_API_KEY',
    models: [
      {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash Lite (cheapest)',
        inputPer1KTokensInr: 0.0032,
        outputPer1KTokensInr: 0.0126,
        modality: 'chat',
        notes:
          'Cheapest production-grade option for simple classification (~4× cheaper than GPT-4o-mini). Default for voice_memo.sentiment.',
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash (higher quality)',
        inputPer1KTokensInr: 0.0063,
        outputPer1KTokensInr: 0.0252,
        modality: 'chat',
        notes: 'Multilingual-friendly; use when sentiment task needs richer reasoning.',
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        inputPer1KTokensInr: 0.106,
        outputPer1KTokensInr: 0.425,
        modality: 'chat',
      },
    ],
  },
  {
    id: 'groq',
    label: 'Groq (fast Whisper inference)',
    envVarHint: 'GROQ_API_KEY',
    models: [
      {
        id: 'whisper-large-v3',
        label: 'Whisper Large v3 (Groq turbo)',
        perMinuteInr: 0.056,
        modality: 'audio_transcription',
        notes:
          'Same Whisper model as OpenAI, served on Groq LPUs. ~9× cheaper than OpenAI Whisper-1 for English audio. Default for voice_memo.transcribe.',
      },
      {
        id: 'whisper-large-v3-turbo',
        label: 'Whisper Large v3 Turbo (lower cost)',
        perMinuteInr: 0.034,
        modality: 'audio_transcription',
        notes: 'Distilled variant, slightly less accurate but cheaper.',
      },
    ],
  },
  {
    id: 'sarvam',
    label: 'Sarvam (Indian language specialist)',
    envVarHint: 'SARVAM_API_KEY',
    models: [
      {
        id: 'saaras:v2',
        label: 'Saaras v2 (multilingual ASR)',
        perMinuteInr: 0.42,
        modality: 'audio_transcription',
        notes: 'Better Tamil/Hindi accuracy than Whisper.',
      },
    ],
  },
];

// Convenience lookups
export function getProviderRegistry(providerId: string): ProviderRegistryEntry | undefined {
  return AI_PROVIDER_REGISTRY.find((p) => p.id === providerId);
}

export function getModel(providerId: string, modelId: string): ModelOption | undefined {
  return getProviderRegistry(providerId)?.models.find((m) => m.id === modelId);
}

export function getModelLabel(providerId: string, modelId: string): string {
  const m = getModel(providerId, modelId);
  return m ? m.label : `${providerId}:${modelId}`;
}

// Provider list for picker dropdown
export const PROVIDER_OPTIONS = AI_PROVIDER_REGISTRY.map((p) => ({
  value: p.id,
  label: p.label,
}));
