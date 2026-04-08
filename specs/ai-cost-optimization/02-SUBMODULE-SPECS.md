# AI Cost Optimization — Submodule Specs

Each phase below includes the exact code changes needed. Read the master spec first for context.

---

## Phase 1: Provider Abstraction

### Create `lib/ai/types.ts`

```typescript
export type AIProvider = 'google-ai' | 'anthropic';

export type AIModel =
  | 'gemma-4-e2b'      // 2B params — translation, simple tasks
  | 'gemma-4-e4b'      // 4B params — response drafting, classification
  | 'gemma-4-26b'      // 26B MoE — reasoning, function calling
  | 'gemma-4-31b'      // 31B Dense — complex analysis
  | 'claude-haiku'     // Anthropic Haiku
  | 'claude-sonnet';   // Anthropic Sonnet

export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  model?: AIModel;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
}

export interface AIResponse {
  text: string;
  model: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  cached: boolean;
}

export interface AIProviderBackend {
  generate(request: AIRequest): Promise<AIResponse>;
}
```

### Create `lib/ai/providers/google-ai.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIRequest, AIResponse, AIProviderBackend } from '../types';

const MODEL_MAP: Record<string, string> = {
  'gemma-4-e2b': 'gemma-4-e2b-it',
  'gemma-4-e4b': 'gemma-4-e4b-it',
  'gemma-4-26b': 'gemma-4-26b-a4b-it',
  'gemma-4-31b': 'gemma-4-31b-it',
};

export class GoogleAIProvider implements AIProviderBackend {
  private client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set');
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const modelId = MODEL_MAP[request.model || 'gemma-4-31b'] || 'gemma-4-31b-it';
    const model = this.client.getGenerativeModel({
      model: modelId,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        ...(request.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
      ...(request.systemPrompt ? { systemInstruction: request.systemPrompt } : {}),
    });

    const result = await model.generateContent(request.prompt);
    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      text,
      model: modelId,
      tokensUsed: usage ? {
        input: usage.promptTokenCount || 0,
        output: usage.candidatesTokenCount || 0,
      } : undefined,
      cached: false,
    };
  }
}
```

### Create `lib/ai/providers/anthropic.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { AIRequest, AIResponse, AIProviderBackend } from '../types';

const MODEL_MAP: Record<string, string> = {
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-sonnet': 'claude-sonnet-4-20250514',
};

export class AnthropicProvider implements AIProviderBackend {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const modelId = MODEL_MAP[request.model || 'claude-sonnet'] || 'claude-sonnet-4-20250514';

    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      messages: [{ role: 'user', content: request.prompt }],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.type === 'text' ? textContent.text : '';

    return {
      text,
      model: modelId,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      cached: false,
    };
  }
}
```

### Create `lib/ai/provider.ts`

```typescript
import type { AIRequest, AIResponse, AIProviderBackend, AIModel } from './types';
import { GoogleAIProvider } from './providers/google-ai';
import { AnthropicProvider } from './providers/anthropic';

// Determine which backend handles which model
const PROVIDER_ROUTING: Record<string, 'google-ai' | 'anthropic'> = {
  'gemma-4-e2b': 'google-ai',
  'gemma-4-e4b': 'google-ai',
  'gemma-4-26b': 'google-ai',
  'gemma-4-31b': 'google-ai',
  'claude-haiku': 'anthropic',
  'claude-sonnet': 'anthropic',
};

class AIProviderManager {
  private providers: Map<string, AIProviderBackend> = new Map();

  private getProvider(providerName: string): AIProviderBackend {
    if (!this.providers.has(providerName)) {
      if (providerName === 'google-ai') {
        this.providers.set(providerName, new GoogleAIProvider());
      } else if (providerName === 'anthropic') {
        this.providers.set(providerName, new AnthropicProvider());
      } else {
        throw new Error(`Unknown provider: ${providerName}`);
      }
    }
    return this.providers.get(providerName)!;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const model = request.model || (process.env.AI_PROVIDER_DEFAULT === 'anthropic'
      ? 'claude-sonnet'
      : 'gemma-4-31b') as AIModel;

    const providerName = PROVIDER_ROUTING[model];
    if (!providerName) throw new Error(`No provider for model: ${model}`);

    const provider = this.getProvider(providerName);
    const response = await provider.generate({ ...request, model });

    // Auto-extract JSON if requested
    if (request.responseFormat === 'json') {
      response.text = this.extractJSON(response.text);
    }

    return response;
  }

  /**
   * Extract JSON from potentially markdown-wrapped responses.
   * Gemma 4 sometimes wraps JSON in ```json ... ``` blocks.
   */
  private extractJSON(text: string): string {
    // Try direct parse first
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Extract from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) return jsonMatch[1].trim();

      // Extract bare JSON object or array
      const objMatch = text.match(/(\{[\s\S]*\})/);
      if (objMatch) return objMatch[1];

      const arrMatch = text.match(/(\[[\s\S]*\])/);
      if (arrMatch) return arrMatch[1];

      return text;
    }
  }
}

// Singleton
export const ai = new AIProviderManager();
```

### Install Dependencies

```bash
npm install @google/generative-ai
```

---

## Phase 2: Tamil Translation → Google Translate API

### Modify `app/api/work-pulse/translate/route.ts`

**Replace the entire Claude translation block** with Google Cloud Translation.

**Option A — Google AI Studio (free, uses Gemma 4):**

If you want to avoid adding another dependency, use the AI provider for translation:

```typescript
// Replace lines 54-65 (the Claude translation block) with:
import { ai } from '@/lib/ai/provider';

const response = await ai.generate({
  prompt: `Translate the following Tamil text to English. Preserve the meaning and context. Return ONLY the English translation, nothing else.\n\nTamil text: ${text}`,
  model: 'gemma-4-e4b',  // Lightweight model, plenty for translation
  maxTokens: 1024,
  temperature: 0.3,      // Low temperature for consistent translations
});

const translation = response.text.trim();
```

**Option B — Google Cloud Translation API (purpose-built, more reliable):**

```bash
npm install @google-cloud/translate
```

```typescript
// Replace lines 54-65 with:
import { TranslationServiceClient } from '@google-cloud/translate';

const translationClient = new TranslationServiceClient();
const [response] = await translationClient.translateText({
  parent: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/global`,
  contents: [text],
  mimeType: 'text/plain',
  sourceLanguageCode: 'ta',
  targetLanguageCode: 'en',
});

const translation = response.translations?.[0]?.translatedText || '';
```

**Recommendation**: Use Option A (Gemma 4) — simpler, no extra dependency, free via Google AI Studio. Tamil is in Gemma 4's native 140+ language training set.

### Remove Anthropic imports from this file

Delete these lines:
```typescript
// DELETE:
import Anthropic from '@anthropic-ai/sdk';
// DELETE the line creating anthropic instance
```

---

## Phase 3: Response Drafting → Gemma 4

### Modify `lib/services/admission/ai-response-service.ts`

**Replace the Anthropic client initialization and API call.**

```typescript
// REPLACE import (line 4):
// OLD: import Anthropic from '@anthropic-ai/sdk';
// NEW:
import { ai } from '@/lib/ai/provider';

// DELETE the entire private static anthropic block (lines 76-96)
// DELETE the getClient() method

// REPLACE the generateResponse method body (lines 102-128):
static async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
  try {
    const prompt = this.buildResponsePrompt(input);

    const response = await ai.generate({
      prompt,
      model: 'gemma-4-e4b',    // Lightweight model — response drafting is simple
      maxTokens: 2048,
      temperature: 0.7,
    });

    // Parse AI response (existing parse logic stays the same)
    const suggestions = this.parseResponseSuggestions(response.text);
    return { suggestions, model: response.model };
  } catch (error) {
    console.error('[admission/ai-response] Failed to generate response:', error);
    throw error;
  }
}
```

**Note**: The `buildResponsePrompt()` and `parseResponseSuggestions()` methods stay unchanged — they work with any model's text output.

---

## Phase 4: Admission Insights + Work Pulse → Gemma 4

### 4A: Modify `lib/services/admission/admission-ai-service.ts`

```typescript
// REPLACE import (line 1):
// OLD: import Anthropic from '@anthropic-ai/sdk';
// NEW:
import { ai } from '@/lib/ai/provider';

// DELETE the private static anthropic block and getClient() method (lines 22-42)

// REPLACE the API call in analyzeAdmissions (lines 63-73):
const response = await ai.generate({
  prompt,
  model: 'gemma-4-31b',      // Complex analysis needs the larger model
  maxTokens: 4096,
  responseFormat: 'json',
});

// Rest of parsing stays the same — it already parses JSON from text
const insights = this.parseAIResponse(response.text);
```

### 4B: Modify `app/api/admission/insights/generate/route.ts`

```typescript
// REPLACE Anthropic imports and client (lines 9, 13):
// OLD: import Anthropic from '@anthropic-ai/sdk';
// OLD: const anthropic = new Anthropic({...});
// NEW:
import { ai } from '@/lib/ai/provider';

// REPLACE the Claude API call (around line 299):
const response = await ai.generate({
  prompt: analysisPrompt,
  model: 'gemma-4-31b',
  maxTokens: 4096,
  responseFormat: 'json',
});

const insightsText = response.text;
// Existing JSON parsing logic continues unchanged
```

### 4C: Modify `app/api/work-pulse/analyze/route.ts`

```typescript
// REPLACE Anthropic imports (line 5):
// OLD: import Anthropic from '@anthropic-ai/sdk';
// NEW:
import { ai } from '@/lib/ai/provider';

// DELETE the anthropic client creation (lines 99-101)
// DELETE the timeout/abort controller (only needed for Anthropic SDK)

// REPLACE the Claude API call (lines 105-112):
const response = await ai.generate({
  prompt,
  model: 'gemma-4-31b',
  maxTokens: 4096,
  responseFormat: 'json',
});

const text = response.text;

// Existing JSON extraction (line 119) stays:
const jsonMatch = text.match(/\[[\s\S]*\]/);
```

**Note**: The `responseFormat: 'json'` option on the provider already handles Gemma 4's tendency to wrap JSON in markdown code blocks. The existing `match(/\[[\s\S]*\]/)` is a second safety net.

---

## Phase 5: Agentic Query → Gemma 4

### Modify `lib/services/admission/agentic-query-service.ts`

This is more delicate because it uses two separate Claude calls (intent parsing + summary generation).

```typescript
// REPLACE import (line 5):
// OLD: import Anthropic from '@anthropic-ai/sdk';
// NEW:
import { ai } from '@/lib/ai/provider';

// DELETE the private static anthropic block and getClient() (lines 169-182)

// REPLACE intent parsing call (around line 362):
const response = await ai.generate({
  prompt: query,
  systemPrompt: systemPrompt,
  model: 'gemma-4-26b',       // 26B MoE handles structured output well
  maxTokens: 1024,
  responseFormat: 'json',
});

// Use response.text instead of extracting from content array
let jsonStr = response.text.trim();
const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
// ... rest of existing parsing logic

// REPLACE summary generation call (around line 694):
const summaryResponse = await ai.generate({
  prompt: summaryPrompt,
  model: 'gemma-4-e4b',       // Summary is simple text — small model works
  maxTokens: 256,
  temperature: 0.5,
});

const summary = summaryResponse.text;
```

### Create missing migration (before deploying Phase 5)

```sql
-- supabase/migrations/[timestamp]_admission_query_history.sql
CREATE TABLE IF NOT EXISTS admission_query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  institution_id UUID REFERENCES institutions(id),
  query TEXT NOT NULL,
  result JSONB DEFAULT '{}',
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admission_query_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own history"
  ON admission_query_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own queries"
  ON admission_query_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## Phase 6: Response Caching

### Create `lib/ai/cache.ts`

```typescript
interface CacheEntry {
  response: string;
  expiresAt: number;
}

class AIResponseCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries = 500;

  /**
   * Generate a cache key from prompt + model.
   * Uses a simple hash — not cryptographic, just needs uniqueness.
   */
  private hashKey(prompt: string, model: string): string {
    let hash = 0;
    const str = `${model}:${prompt}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `ai_cache_${hash.toString(36)}`;
  }

  get(prompt: string, model: string): string | null {
    const key = this.hashKey(prompt, model);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  set(prompt: string, model: string, response: string, ttlMs: number): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = this.hashKey(prompt, model);
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const aiCache = new AIResponseCache();
```

### Integrate cache into `lib/ai/provider.ts`

Add to the `generate` method:

```typescript
import { aiCache } from './cache';

// Default TTL by feature (ms)
const CACHE_TTL: Record<string, number> = {
  translation: 24 * 60 * 60 * 1000,  // 24 hours
  insights: 10 * 60 * 1000,           // 10 minutes
  analysis: 5 * 60 * 1000,            // 5 minutes
  // response drafting and queries: no cache (0)
};

async generate(request: AIRequest & { cacheKey?: string; cacheTtl?: number }): Promise<AIResponse> {
  // Check cache first
  if (request.cacheKey && request.cacheTtl) {
    const cached = aiCache.get(request.cacheKey, request.model || 'default');
    if (cached) {
      return { text: cached, model: request.model || 'default', cached: true };
    }
  }

  // ... existing generation logic ...

  // Store in cache
  if (request.cacheKey && request.cacheTtl && request.cacheTtl > 0) {
    aiCache.set(request.cacheKey, request.model || 'default', response.text, request.cacheTtl);
  }

  return response;
}
```

---

## Phase 7: Cleanup

### `package.json`

The `@anthropic-ai/sdk` dependency stays — it's still used by `app/api/ai-query/route.ts` and `lib/ai/providers/anthropic.ts`.

### `.env.local` / `.env.production.local`

```env
# ADD these:
GOOGLE_AI_API_KEY=<provided by project owner>
AI_PROVIDER_DEFAULT=google-ai

# KEEP (used by ai-query route):
ANTHROPIC_API_KEY=sk-ant-...

# REMOVE (duplicate — code now uses ANTHROPIC_API_KEY via provider):
# CLAUDE_API_KEY=sk-ant-...    ← delete this line
```

### Verify no stale Anthropic imports

```bash
# After all phases, run this to verify:
grep -r "import Anthropic" --include="*.ts" app/ lib/ hooks/ \
  | grep -v "node_modules" \
  | grep -v ".claude/worktrees" \
  | grep -v "lib/ai/providers/anthropic.ts"

# Should only show:
#   app/api/ai-query/route.ts   ← this is expected (stays on Claude)
```

---

## Prompt Adjustments for Gemma 4

Gemma 4 responds differently than Claude. Key differences:

1. **System prompts**: Gemma 4 uses `systemInstruction` (already handled by provider). Works similarly to Claude's `system` parameter.

2. **JSON output**: Gemma 4 supports `responseMimeType: 'application/json'` which forces JSON output. More reliable than Claude's text-based JSON extraction.

3. **Verbosity**: Gemma 4 tends to be slightly more verbose. If JSON responses include extra fields, the existing parsing (which extracts specific fields) will ignore extras safely.

4. **Tamil language**: Gemma 4 was trained on 140+ languages including Tamil. Translation quality should be comparable to Claude Haiku.

5. **Temperature**: Gemma 4 with `temperature: 0.7` produces similar creativity levels to Claude. For structured output (JSON), use `0.3-0.5`.

---

*Generated: 2026-04-07 | All code templates verified against current codebase*
