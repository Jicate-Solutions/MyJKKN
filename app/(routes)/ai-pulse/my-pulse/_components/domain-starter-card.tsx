// app/(routes)/ai-pulse/my-pulse/_components/domain-starter-card.tsx
// Created: 2026-07-20 — AI Pulse "Domain Starter" learner read path.
//
// Learner-facing card on /ai-pulse/my-pulse: this cycle's copy-paste AI
// starter pack for the learner's own subject/programme. Each starter offers
// three ready-to-use prompts (Build & post / Practice a skill / For your
// portfolio). Tamil is offered only when a reviewed Tamil pack is available.
//
// Substrate (ai_pulse_domain_starters + RPCs) is APPLIED to production but the
// generation loop is DARK behind ai_pulse_policies.domain_starter_enabled=false,
// so fn_ai_pulse_my_domain_starters returns zero rows until the switch is
// flipped and a cycle is generated — the card then renders nothing.
//
// Cycle resolution mirrors the generation cron / RPC exactly: the latest
// startup_events row with config->>kind = 'ai_pulse' and status <> 'cancelled',
// ordered by demo_date desc. Matching that derivation is load-bearing — a
// different cycle id would return no starters for the learner.
//
// The four learner RPCs are `authenticated` + self-scoped, so the browser
// (session-scoped) client is correct here.
//
// Pattern reference: ./pde-progress-card.tsx (client card + React Query + the
// untyped-cast RPC access for tables/functions not in generated types).

'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Copy,
  Check,
  Flag,
  Languages,
  Rocket,
  GraduationCap,
  Briefcase,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/domain-starter';

// ============================================================================
// Types
// ============================================================================

/** One mode's copy inside a language block. */
interface PromptModes {
  build?: string | null;
  skill?: string | null;
  career?: string | null;
}

/** prompt_pack jsonb: { en: {...}, ta?: {...} }. ta is stripped by the RPC
 *  unless the row's Tamil is available, in which case tamil_available=true. */
interface PromptPack {
  en?: PromptModes | null;
  ta?: PromptModes | null;
  [key: string]: unknown;
}

interface DomainStarterRow {
  starter_id: string;
  // 'course' | 'programme' | 'general'. 'general' is the all-subject fallback
  // returned when this cycle has no prompt for the reader's own programme
  // (Director decision #6, 2026-07-30) — it must be labelled as general, never
  // dressed up as one written for their subject.
  topic_type: string;
  topic_label: string;
  final_prompt: string;
  prompt_pack: PromptPack | null;
  tamil_available: boolean;
}

type ModeKey = 'build' | 'skill' | 'career';

// Plain, 12th-grade-English labels + why-you'd-use-it, one per mode.
const MODE_META: Record<
  ModeKey,
  { label: string; hint: string; icon: typeof Rocket }
> = {
  build: {
    label: 'Build & post',
    hint: 'Make something and share it publicly.',
    icon: Rocket,
  },
  skill: {
    label: 'Practice a skill',
    hint: 'Get better at one hands-on skill.',
    icon: GraduationCap,
  },
  career: {
    label: 'For your portfolio',
    hint: 'Produce work you can show an employer.',
    icon: Briefcase,
  },
};

const MODE_ORDER: ModeKey[] = ['build', 'skill', 'career'];

// ============================================================================
// Data hook — resolve current ai_pulse cycle, then read the learner's starters
// ============================================================================

async function fetchMyDomainStarters(cycleId?: string): Promise<DomainStarterRow[]> {
  // Neither startup_events' JSONB filter nor the domain-starter RPCs are in the
  // generated types → untyped client (same approach as pde-progress-card).
  const supabase = createClientSupabaseClient() as any;

  // When the week switcher passes a cycleId, read starters for THAT cycle.
  // Otherwise fall back to the latest ai_pulse cycle (matches the cron/RPC
  // derivation) so the card works standalone / on the current week.
  let resolvedCycleId = cycleId ?? null;

  if (!resolvedCycleId) {
    const { data: cycle, error: cycleError } = await supabase
      .from('startup_events')
      .select('id')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .neq('status', 'cancelled')
      .order('demo_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (cycleError) {
      logger.error(MODULE, 'cycle resolution failed', cycleError);
      throw new Error(cycleError.message ?? 'Failed to resolve AI Pulse cycle');
    }
    if (!cycle?.id) return [];
    resolvedCycleId = cycle.id;
  }

  const { data, error } = await supabase.rpc('fn_ai_pulse_my_domain_starters', {
    p_cycle_id: resolvedCycleId,
  });

  if (error) {
    logger.error(MODULE, 'fn_ai_pulse_my_domain_starters failed', error);
    throw new Error(error.message ?? 'Failed to load AI starters');
  }

  return (data ?? []) as DomainStarterRow[];
}

function useMyDomainStarters(cycleId?: string) {
  return useQuery<DomainStarterRow[], Error>({
    queryKey: ['ai-pulse', 'domain-starters', cycleId ?? 'latest'],
    queryFn: () => fetchMyDomainStarters(cycleId),
    staleTime: 60_000,
  });
}

type UsageAction = 'view' | 'copy' | 'worked' | 'didnt_work';

/** Best-effort usage ping — never throws into the UI.
 *
 *  'worked' / 'didnt_work' are the QUALITY signal. views and copies only say a
 *  prompt was seen: on the 2026-08-06 cycle views went 50 -> 438 within an hour
 *  of the announcement being fixed while no prompt changed, so exposure cannot
 *  tell a good prompt from a well-announced one. A verdict can, and unlike the
 *  outcome-lift measurement it does not depend on the attendance -> topic join
 *  that leaves the general fallback and the non-rotation programmes unreachable.
 *
 *  Re-clicking is safe: the writer counts DISTINCT learners, and switching your
 *  answer replaces the previous verdict rather than recording both. */
async function recordUsage(starterId: string, action: UsageAction, note?: string) {
  try {
    const supabase = createClientSupabaseClient() as any;
    await supabase.rpc('fn_ai_pulse_domain_starter_used', {
      p_starter_id: starterId,
      p_action: action,
      ...(note ? { p_note: note } : {}),
    });
  } catch (e) {
    logger.dev(MODULE, `usage ping (${action}) failed`, e);
  }
}

// ============================================================================
// Single starter
// ============================================================================

function StarterItem({ row }: { row: DomainStarterRow }) {
  const [lang, setLang] = useState<'en' | 'ta'>('en');
  const [copiedMode, setCopiedMode] = useState<ModeKey | null>(null);
  const [reported, setReported] = useState(false);
  // Session-local only: the reader fn does not yet return the learner's own
  // verdict, so a reload shows the buttons again. Re-answering is harmless —
  // the writer counts DISTINCT learners and replaces rather than duplicates.
  const [verdict, setVerdict] = useState<'worked' | 'didnt_work' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const pack = row.prompt_pack ?? {};
  // Only offer Tamil when the RPC says a reviewed Tamil pack exists AND it's
  // actually present on this row.
  const tamilReady = row.tamil_available === true && !!pack.ta;
  const active: PromptModes =
    (lang === 'ta' && tamilReady ? pack.ta : pack.en) ?? {};

  async function handleCopy(mode: ModeKey, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be blocked (permissions / insecure context). The usage
      // ping still fires so the copy intent is captured; surface a soft hint.
      logger.dev(MODULE, 'clipboard.writeText blocked');
    }
    setCopiedMode(mode);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedMode(null), 1600);
    void recordUsage(row.starter_id, 'copy');
  }

  // The quality signal. Optimistic: the verdict is shown immediately and the
  // write is best-effort, because a learner should never be blocked by a
  // telemetry round-trip. On "it didn't", we ask why — that free text is the
  // part a future generator can actually learn from, and it is optional.
  async function handleVerdict(v: 'worked' | 'didnt_work') {
    setVerdict(v);
    let note: string | undefined;
    if (v === 'didnt_work' && typeof window !== 'undefined') {
      const said = window.prompt(
        'What did not work about it? (optional — you can leave this blank)'
      );
      if (said && said.trim()) note = said.trim();
    }
    await recordUsage(row.starter_id, v, note);
  }

  async function handleReport() {
    if (typeof window === 'undefined') return;
    const reason = window.prompt(
      'Report this prompt — what looks wrong? (optional, you can leave this blank)'
    );
    // Cancel returns null → do nothing. Empty string is a valid "no reason".
    if (reason === null) return;
    try {
      const supabase = createClientSupabaseClient() as any;
      await supabase.rpc('fn_ai_pulse_domain_starter_report', {
        p_starter_id: row.starter_id,
        p_reason: reason.trim(),
      });
      setReported(true);
    } catch (e) {
      logger.error(MODULE, 'domain starter report failed', e);
    }
  }

  const modes = MODE_ORDER.map((key) => ({
    key,
    ...MODE_META[key],
    text: (active[key] ?? '').toString().trim(),
  })).filter((m) => m.text.length > 0);

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.topic_label}</p>
          <p className="text-xs text-muted-foreground">
            {row.topic_type === 'course'
              ? 'For your subject'
              : row.topic_type === 'general'
                ? 'A general prompt — not written for your subject'
                : 'For your programme'}
          </p>
        </div>
        {tamilReady && (
          <div className="flex shrink-0 items-center rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded px-2 py-0.5 ${
                lang === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              aria-pressed={lang === 'en'}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('ta')}
              className={`rounded px-2 py-0.5 ${
                lang === 'ta'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              aria-pressed={lang === 'ta'}
            >
              <span className="inline-flex items-center gap-1">
                <Languages className="h-3 w-3" aria-hidden />
                தமிழ்
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {modes.map((m) => {
          const Icon = m.icon;
          const isCopied = copiedMode === m.key;
          return (
            <div key={m.key} className="rounded-md bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-none">
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.hint}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isCopied ? 'secondary' : 'outline'}
                  className="shrink-0 gap-1"
                  onClick={() => handleCopy(m.key, m.text)}
                  aria-label={`Copy the "${m.label}" prompt`}
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                {m.text}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        {verdict ? (
          <span className="text-xs text-muted-foreground">
            {verdict === 'worked'
              ? 'Thanks — noted. Next week’s prompt for your programme is written from this.'
              : 'Thanks — noted. We’ll use this to write a better one next week.'}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Did this work for you?</span>
            <button
              type="button"
              onClick={() => handleVerdict('worked')}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
            >
              <ThumbsUp className="h-3 w-3" aria-hidden />
              It worked
            </button>
            <button
              type="button"
              onClick={() => handleVerdict('didnt_work')}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
            >
              <ThumbsDown className="h-3 w-3" aria-hidden />
              It didn&rsquo;t
            </button>
          </div>
        )}

        {reported ? (
          <span className="text-xs text-muted-foreground">
            Thanks, we&rsquo;ll review it.
          </span>
        ) : (
          <button
            type="button"
            onClick={handleReport}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <Flag className="h-3 w-3" aria-hidden />
            Report this prompt
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================

export function DomainStarterCard({ cycleId }: { cycleId?: string } = {}) {
  const { data, isLoading, error } = useMyDomainStarters(cycleId);
  const starters = data ?? [];

  // Fire a one-time 'view' ping per starter the first time it appears. Tracked
  // in a ref so re-renders don't re-fire; best-effort, never blocks the UI.
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const s of starters) {
      if (!viewedRef.current.has(s.starter_id)) {
        viewedRef.current.add(s.starter_id);
        void recordUsage(s.starter_id, 'view');
      }
    }
  }, [starters]);

  // Empty / error / dark-substrate → keep the page clean, never crash.
  if (!isLoading && (error || starters.length === 0)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Your AI Starter</CardTitle>
        </div>
        <CardDescription>
          Ready-to-use AI prompts for your subject this week — copy one and try
          it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your starter…</p>
        ) : (
          <>
            {starters.length > 1 && (
              <Badge variant="secondary" className="gap-1">
                {starters.length} starters for you
              </Badge>
            )}
            {starters.map((row) => (
              <StarterItem key={row.starter_id} row={row} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
