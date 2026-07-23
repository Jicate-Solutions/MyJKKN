/**
 * Feedback Spine — AI classify worker.
 *
 * One Claude call per feedback event (model from ai_model_config,
 * feature_key 'feedback.classify') → {sentiment, intent, topic,
 * draft_reply}. This is the "take advantage of AI" layer: it turns raw feedback
 * text into structured signal the loops can act on, and drafts a personalized
 * reply a human approves before sending.
 *
 * Runs on the Anthropic API (process.env.ANTHROPIC_API_KEY) — the same key the
 * session-feedback AI-suggest route uses. NOT the Claude subscription: a live
 * per-event app feature must call the API directly. Cost ~ a few hundred input
 * + ~150 output tokens per event (fractions of a cent).
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  resolveChatModel,
  recordChatCall,
} from '@/lib/services/platform/ai-clients/chat';
import type {
  FeedbackClassification,
  AiSentiment,
  AiIntent,
} from '@/lib/types/feedback-spine';

// Model comes from ai_model_config (admin-governed) — resolved per call via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure). The caller (feedback-classify cron) loops BATCH=25 rows; the
// service's 60s cache makes the repeated resolution a single DB read per run.
const FEATURE_KEY = 'feedback.classify';
const SENTIMENTS: AiSentiment[] = ['positive', 'neutral', 'negative', 'mixed'];
const INTENTS: AiIntent[] = [
  'praise',
  'complaint',
  'question',
  'request',
  'suggestion',
  'spam',
];

const SYSTEM = `You classify a single piece of audience feedback for an Indian educational institution (JKKN). Feedback may be in English, Tamil, or mixed (Tanglish). Respond with ONLY a JSON object, no prose, with exactly these keys:
- "sentiment": one of positive | neutral | negative | mixed
- "intent": one of praise | complaint | question | request | suggestion | spam
- "topic": a 2-5 word lowercase topic label (e.g. "hostel food quality", "admission fee query")
- "draft_reply": a warm, specific, ≤300-char reply in the SAME language as the feedback that a staff member could send after a quick check. For complaints, acknowledge + next step. For questions, answer or say who will. Never invent facts, fees, or dates — if unknown, say it'll be confirmed.`;

/** Classify one feedback string. Throws on API/parse failure (caller decides). */
export async function classifyFeedback(
  content: string
): Promise<FeedbackClassification> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);
  const anthropic = new Anthropic({ apiKey });
  const t0 = Date.now();
  let resp: Anthropic.Message;
  try {
    resp = await anthropic.messages.create({
      model: modelId,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: content.slice(0, 4000) }],
    });
  } catch (err) {
    // Record the failed invocation (recordChatCall is internally non-throwing,
    // MUST be awaited — serverless drops un-awaited promises), then RETHROW:
    // the cron catches per-row and leaves ai_processed_at NULL so a later run
    // retries. Swallowing here would break that retry queue.
    await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, null, err);
    throw err;
  }
  await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, resp);

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Be tolerant of a ```json fence or stray prose around the object.
  const jsonStr = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`classify: no JSON in response: ${text.slice(0, 120)}`);
  const parsed = JSON.parse(match[0]) as Partial<FeedbackClassification>;

  const sentiment = SENTIMENTS.includes(parsed.sentiment as AiSentiment)
    ? (parsed.sentiment as AiSentiment)
    : 'neutral';
  const intent = INTENTS.includes(parsed.intent as AiIntent)
    ? (parsed.intent as AiIntent)
    : 'suggestion';

  return {
    sentiment,
    intent,
    topic: (parsed.topic || 'general').toString().slice(0, 80),
    draft_reply: (parsed.draft_reply || '').toString().slice(0, 600),
    // ACTUAL model from the response (not the config value) — the caller writes
    // this to feedback_events.ai_model, so the audit column must stay truthful.
    model: resp.model,
  };
}
