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
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash (cheap, fast)',
        inputPer1KTokensInr: 0.013,
        outputPer1KTokensInr: 0.043,
        modality: 'chat',
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
