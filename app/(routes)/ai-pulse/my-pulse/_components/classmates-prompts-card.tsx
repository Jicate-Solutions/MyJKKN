// app/(routes)/ai-pulse/my-pulse/_components/classmates-prompts-card.tsx
// Created: 2026-07-26 — AI Pulse Star-Library v2, PR B: the "classmates' prompts" feed.
// Spec: specs/ai-pulse-star-library-v2-2026-07-26.md (decisions #5, #6)
//
// Learner-facing card on /ai-pulse/my-pulse. Shows NON-star peer prompts (AI score
// 60–79 — decent, not yet a library star) built by classmates on the learner's own
// topics, matched by subject NAME across ALL JKKN colleges. Each carries a Copy
// button: copying puts the text on the clipboard AND pings
// fn_ai_pulse_record_prompt_build_use(p_build_id, 'copy'), which counts distinct
// copiers. Three distinct copiers is the popularity signal that can promote a
// not-yet-star prompt into the library — the path that was structurally dead while
// the copy recorder only accepted already-graduated, same-college targets.
//
// DARK-SAFE: usePeerPrompts resolves to [] while there are no 60–79 non-graduated
// builds for the learner's topics (true today), so this card renders null and the
// page is byte-identical to now. It lights up on its own once such prompts exist.
//
// Pattern reference: ./shared-library-card.tsx (client card + React Query) and
// ./domain-starter-card.tsx (clipboard copy + best-effort usage ping).

'use client';

import { useEffect, useRef, useState } from 'react';
import { Users2, Copy, Check, Sparkles, Users } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  usePeerPrompts,
  recordPromptCopy,
  type PeerPromptRow,
} from '@/lib/services/ai-pulse/shared-library-service';

function topicLabel(topicType: string): string {
  if (topicType === 'course') return 'For your subject';
  if (topicType === 'programme') return 'For your programme';
  return 'From your classmates';
}

// ── one classmate prompt + its copy button ──────────────────────────────────

function PeerPromptItem({ row }: { row: PeerPromptRow }) {
  const [copied, setCopied] = useState(false);
  const [usedCount, setUsedCount] = useState(row.used_count);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(row.assembled_prompt);
    } catch {
      // Clipboard can be blocked (permissions / insecure context). The usage
      // ping still fires so the copy intent is captured.
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    // Best-effort popularity ping; returns the new distinct-copier count (or null
    // when the ping was a no-op). Reflect the fresh count when we get one.
    const next = await recordPromptCopy(row.id);
    if (typeof next === 'number' && next > usedCount) setUsedCount(next);
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{topicLabel(row.topic_type)}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {typeof row.score === 'number' && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" aria-hidden />
              {row.score}
            </Badge>
          )}
          {usedCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" aria-hidden />
              used {usedCount} {usedCount === 1 ? 'time' : 'times'}
            </Badge>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
        {row.assembled_prompt}
      </p>

      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label="Copy this prompt"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden />
              Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────

export function ClassmatesPromptsCard({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading, error } = usePeerPrompts(cycleId);
  const prompts = data ?? [];

  // Empty / loading / error → render nothing so the page stays clean and
  // byte-identical to today. The card appears only once classmates have decent
  // (score 60–79) prompts on the learner's topics.
  if (isLoading || error || prompts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" aria-hidden />
          Classmates’ prompts
        </CardTitle>
        <CardDescription>
          Promising prompts your classmates built on your topics — copy one to reuse it,
          and the ones people copy most rise into the library.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {prompts.map((row) => (
          <PeerPromptItem key={row.id} row={row} />
        ))}
      </CardContent>
    </Card>
  );
}
