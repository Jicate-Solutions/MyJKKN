/**
 * Feedback Spine — AI classify worker.
 *
 * One claude-sonnet-4-6 call per feedback event → {sentiment, intent, topic,
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
import type {
  FeedbackClassification,
  AiSentiment,
  AiIntent,
} from '@/lib/types/feedback-spine';

const MODEL = 'claude-sonnet-4-6';
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

  const anthropic = new Anthropic({ apiKey });
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: 'user', content: content.slice(0, 4000) }],
  });

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
    model: MODEL,
  };
}
