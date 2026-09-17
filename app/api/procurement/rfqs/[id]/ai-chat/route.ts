import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireProcurement, PROC_VIEW, PROC_QUOTATION_MANAGE } from '@/lib/utils/procurement-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { anthropicApiKey } from '@/lib/services/platform/ai-clients/api-key';
import {
  computeChatCostInr,
  recordChatCall,
  resolveChatModel,
} from '@/lib/services/platform/ai-clients/chat';
import { buildCompareFacts, renderFactsForPrompt } from '@/lib/procurement/quotation-compare-facts';
import {
  QUOTATION_COMPARE_CHAT_FEATURE,
  SUGGEST_AWARDS_TOOL,
  buildSystemPrompt,
  validateSuggestion,
} from '@/lib/procurement/quotation-compare-agent';
import { istBusinessDate, istDayBounds } from '@/lib/utils/date-format';
import type { QuotationWithItems } from '@/types/procurement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAILY_QUESTION_LIMIT = 50;
const HISTORY_TURNS = 12;
const MAX_QUESTION_CHARS = 2000;

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Load the RFQ and its quotations AS THE CALLER — existing procurement RLS
 * decides what the assistant may see. Null when the RFQ is not visible.
 */
async function loadRfq(rfqId: string) {
  const db = await createClient();
  const { data: rfq } = await db
    .from('procurement_rfqs')
    .select('id, rfq_number, status, institution_id')
    .eq('id', rfqId)
    .maybeSingle();
  if (!rfq) return null;

  const [{ data: items }, { data: quotations }] = await Promise.all([
    db
      .from('procurement_rfq_items')
      .select('id, item_name, item_spec, quantity, unit_label')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: true }),
    db
      .from('procurement_quotations')
      .select('*, supplier:ims_suppliers(id,name,code,email)')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: true }),
  ]);

  const ids = (quotations ?? []).map((q: { id: string }) => q.id);
  const { data: lines } = ids.length
    ? await db.from('procurement_quotation_items').select('*').in('quotation_id', ids)
    : { data: [] };

  const withItems = (quotations ?? []).map((q: { id: string }) => ({
    ...q,
    items: (lines ?? []).filter((l: { quotation_id: string }) => l.quotation_id === q.id),
  })) as unknown as QuotationWithItems[];

  return {
    rfq: rfq as { id: string; rfq_number: string; status: string; institution_id: string },
    items: (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })),
    quotations: withItems,
  };
}

/** GET — the RFQ's saved conversation, oldest first. */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const user = await requireProcurement(PROC_VIEW);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id: rfqId } = await ctx.params;
  if (!UUID_RE.test(rfqId)) return NextResponse.json({ error: 'Invalid RFQ.' }, { status: 400 });

  // RLS-scoped read: someone without access to the institution gets nothing.
  const db = await createClient();
  const { data, error } = await db
    .from('procurement_rfq_ai_messages')
    .select(
      'id, role, content, suggestion, applied_at, created_at, user_id, author:profiles!user_id(full_name), applier:profiles!applied_by(full_name)',
    )
    .eq('rfq_id', rfqId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.error('[rfq ai-chat] history failed:', error);
    return NextResponse.json({ error: 'Could not load the conversation.' }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

/** PATCH { message_id } — record that a suggestion was applied. */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const user = await requireProcurement(PROC_QUOTATION_MANAGE);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id: rfqId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const messageId = typeof body?.message_id === 'string' ? body.message_id : '';
  if (!UUID_RE.test(rfqId) || !UUID_RE.test(messageId)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  // Visibility check as the caller before the service-role write.
  if (!(await loadRfq(rfqId))) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 });

  const { error } = await createServiceRoleClient()
    .from('procurement_rfq_ai_messages')
    .update({ applied_at: new Date().toISOString(), applied_by: user.id })
    .eq('id', messageId)
    .eq('rfq_id', rfqId)
    .not('suggestion', 'is', null);
  if (error) {
    console.error('[rfq ai-chat] mark applied failed:', error);
    return NextResponse.json({ error: 'Could not record the award.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * POST { message } — ask about this RFQ. Streams NDJSON lines:
 *   { type: 'text', delta } … { type: 'suggestion', suggestion }? { type: 'done', message_id }
 *   or { type: 'error', message } at any point.
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = await requireProcurement(PROC_VIEW);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id: rfqId } = await ctx.params;
  if (!UUID_RE.test(rfqId)) return NextResponse.json({ error: 'Invalid RFQ.' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const question = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!question) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: 'That question is too long — please shorten it.' }, { status: 400 });
  }

  const apiKey = anthropicApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'The AI assistant is not available on this server.' }, { status: 503 });
  }

  const loaded = await loadRfq(rfqId);
  if (!loaded) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 });
  const admin = createServiceRoleClient();

  // ── Limits ────────────────────────────────────────────────────────────────
  const { from: dayStart } = istDayBounds(istBusinessDate());
  const { count: askedToday } = await admin
    .from('procurement_rfq_ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', dayStart);
  if ((askedToday ?? 0) >= DAILY_QUESTION_LIMIT) {
    return NextResponse.json(
      { error: `You have asked ${DAILY_QUESTION_LIMIT} questions today — the limit resets tomorrow.` },
      { status: 429 },
    );
  }

  const { data: cfg } = await admin
    .from('ai_model_config')
    .select('monthly_spend_cap_inr, is_active')
    .eq('feature_key', QUOTATION_COMPARE_CHAT_FEATURE)
    .maybeSingle();
  if (cfg && cfg.is_active === false) {
    return NextResponse.json({ error: 'The AI assistant is switched off.' }, { status: 503 });
  }
  const cap = cfg?.monthly_spend_cap_inr == null ? null : Number(cfg.monthly_spend_cap_inr);
  if (cap !== null) {
    const monthStart = `${istBusinessDate().slice(0, 7)}-01T00:00:00+05:30`;
    const { data: spent } = await admin
      .from('ai_model_usage')
      .select('cost_inr')
      .eq('feature_key', QUOTATION_COMPARE_CHAT_FEATURE)
      .gte('invoked_at', monthStart);
    const total = (spent ?? []).reduce((s: number, r: { cost_inr: unknown }) => s + Number(r.cost_inr ?? 0), 0);
    if (total >= cap) {
      return NextResponse.json(
        { error: "This month's budget for the AI assistant is used up. An administrator can raise it." },
        { status: 429 },
      );
    }
  }

  // ── Prompt ────────────────────────────────────────────────────────────────
  const facts = buildCompareFacts({ ...loaded.rfq, items: loaded.items }, loaded.quotations);
  const system = buildSystemPrompt(renderFactsForPrompt(facts));

  const { data: past } = await admin
    .from('procurement_rfq_ai_messages')
    .select('role, content, suggestion')
    .eq('rfq_id', rfqId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS);
  const history: Anthropic.MessageParam[] = (past ?? [])
    .reverse()
    .map((m: { role: 'user' | 'assistant'; content: string; suggestion: { summary?: string } | null }) => ({
      role: m.role,
      content:
        [m.content, m.suggestion ? `[Proposed an award plan: ${m.suggestion.summary || 'see card'}]` : '']
          .filter(Boolean)
          .join('\n') || '(no text)',
    }));
  while (history.length && history[0].role !== 'user') history.shift();
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: question }];

  const { model_id: modelId } = await resolveChatModel(QUOTATION_COMPARE_CHAT_FEATURE);
  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      const startedAt = Date.now();
      try {
        const s = client.messages.stream({
          model: modelId,
          max_tokens: 2048,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools: [SUGGEST_AWARDS_TOOL],
          messages,
        });
        for await (const event of s) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'text', delta: event.delta.text });
          }
        }
        const final = await s.finalMessage();
        await recordChatCall(QUOTATION_COMPARE_CHAT_FEATURE, 'anthropic', modelId, startedAt, final);

        const text = final.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();
        const toolUse = final.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === SUGGEST_AWARDS_TOOL.name,
        );
        const suggestion = toolUse ? validateSuggestion(facts, toolUse.input) : null;
        if (suggestion) send({ type: 'suggestion', suggestion });
        if (final.stop_reason === 'max_tokens') {
          send({ type: 'text', delta: '\n\n_(The answer was cut short — ask a narrower question.)_' });
        }

        const costInr = computeChatCostInr(modelId, final.usage.input_tokens, final.usage.output_tokens);
        const now = Date.now();
        const { data: saved, error: saveError } = await admin
          .from('procurement_rfq_ai_messages')
          .insert([
            {
              rfq_id: rfqId,
              institution_id: loaded.rfq.institution_id,
              user_id: user.id,
              role: 'user',
              content: question,
              created_at: new Date(now - 1).toISOString(),
            },
            {
              rfq_id: rfqId,
              institution_id: loaded.rfq.institution_id,
              user_id: user.id,
              role: 'assistant',
              content: text,
              suggestion,
              model_id: modelId,
              input_tokens: final.usage.input_tokens,
              output_tokens: final.usage.output_tokens,
              cost_inr: costInr,
              created_at: new Date(now).toISOString(),
            },
          ])
          .select('id, role');
        if (saveError) console.error('[rfq ai-chat] save failed:', saveError);

        send({
          type: 'done',
          message_id: saved?.find((r: { role: string }) => r.role === 'assistant')?.id ?? null,
        });
      } catch (err) {
        await recordChatCall(QUOTATION_COMPARE_CHAT_FEATURE, 'anthropic', modelId, startedAt, null, err);
        console.error('[rfq ai-chat] call failed:', err);
        const message =
          err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError
            ? 'The AI assistant is busy — please try again in a minute.'
            : err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError
              ? 'The AI assistant is not available right now.'
              : 'The AI assistant could not answer — please try again.';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
