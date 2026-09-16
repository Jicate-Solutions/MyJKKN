// lib/services/platform/ai-clients/api-key.ts
//
// The paid Claude API key. Deployments name it differently: the shared chat
// wrapper reads ANTHROPIC_API_KEY, while the repo's .env (and the admission
// services) use CLAUDE_API_KEY. Direct paid call sites accept either.

export function anthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || null;
}
