// app/(routes)/ai-pulse/my-pulse/_components/prompt-builder-card.tsx
// Created: 2026-07-23 — AI Pulse "learn prompt engineering" build-from-parts card.
//
// The learner builds a prompt from four parts (Role / Context / Task / Output
// format), watches it assemble in a live preview, and submits it for an AI grade
// on the ₹0 Max lane. Teaching-by-doing: the four parts ARE the checklist they're
// learning. Backend: fn_ai_pulse_submit_prompt_build + fn_ai_pulse_my_prompt_builds
// + the aipulse-prompt-grade cron (all applied to prod).
//
// DARK: fn_ai_pulse_prompt_build_enabled() gates rendering — the card returns null
// until ai_pulse_policies.prompt_build_enabled is flipped on, so this ships inert.
//
// Pattern reference: ./domain-starter-card.tsx (client card + React Query + the
// untyped-cast RPC access for functions not in generated types; browser
// session-scoped client is correct — the four RPCs are `authenticated` + self-scoped).

'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wand2, CheckCircle2, Circle, Loader2, Sparkles, Send } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import toast from 'react-hot-toast';

const MODULE = 'ai-pulse/prompt-builder';

// Map the submit RPC's raised exceptions to plain-language messages. Without
// this the card swallowed every failure silently (onError only logged) — most
// visibly, an admin/champion (no learner_id) got 'not_a_learner' and saw nothing.
function submitErrorMessage(e: Error): string {
  const m = e?.message ?? '';
  if (m.includes('not_a_learner')) return 'Prompt building is for learners — open it from a learner account.';
  if (m.includes('prompt_build_disabled')) return 'Prompt building is currently turned off.';
  if (m.includes('empty_prompt')) return 'Fill in at least a couple of parts before submitting.';
  return 'Could not submit your prompt. Please try again.';
}

// The four parts the learner assembles — also the grading checklist.
const PARTS = [
  { key: 'role', label: 'Role', hint: 'Who should the AI act as?', eg: 'Act as a clinical pharmacist.' },
  { key: 'context', label: 'Context', hint: 'Your own goal, background, or a real example.', eg: 'I am studying a diabetic patient on metformin.' },
  { key: 'task', label: 'Task', hint: 'What do you want the AI to do?', eg: 'Explain the common side effects in simple words.' },
  { key: 'format', label: 'Output format', hint: 'How should the answer look?', eg: 'Give me 3 short bullet points.' },
] as const;

type PartKey = (typeof PARTS)[number]['key'];

type Grade = {
  has_role?: boolean;
  has_context?: boolean;
  has_task?: boolean;
  has_format?: boolean;
  score?: number;
  tips?: string[];
} | null;

type BuildRow = {
  id: string;
  assembled_prompt: string;
  grade: Grade;
  grade_status: string;
  created_at: string;
};

const EMPTY: Record<PartKey, string> = { role: '', context: '', task: '', format: '' };

function assemble(parts: Record<PartKey, string>): string {
  return PARTS.map((p) => parts[p.key]?.trim()).filter(Boolean).join(' ');
}

// ── data hooks (untyped-cast RPC, matching domain-starter-card) ─────────────

function usePromptBuildEnabled() {
  const supabase = createClientSupabaseClient() as any;
  return useQuery<boolean, Error>({
    queryKey: ['ai-pulse', 'prompt-build-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ai_pulse_prompt_build_enabled');
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
  });
}

function useMyBuilds(cycleId?: string | null) {
  const supabase = createClientSupabaseClient() as any;
  return useQuery<BuildRow[], Error>({
    queryKey: ['ai-pulse', 'my-prompt-builds', cycleId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ai_pulse_my_prompt_builds', {
        p_cycle_id: cycleId ?? null,
      });
      if (error) throw error;
      return (data as BuildRow[]) ?? [];
    },
    // graded results land asynchronously from the Max-lane cron; poll gently.
    refetchInterval: (query) =>
      ((query.state.data as BuildRow[] | undefined) ?? []).some(
        (b) => b.grade_status === 'pending',
      )
        ? 15_000
        : false,
  });
}

// The learner's own topics (their course(s) + programme), self-scoped. Returned
// finest-first (course over programme), so [0] is the finest topic they have. We
// stamp each build with this so a high-scoring prompt can graduate into that
// topic's shared library — a topicless build has no shelf to land on and can
// never surface. (The submit RPC also resolves this server-side as a fallback;
// passing it here keeps the learner-visible "files under" label honest.)
type Topic = { topic_type: string; topic_id: string; topic_label: string };

function useMyTopics() {
  const supabase = createClientSupabaseClient() as any;
  return useQuery<Topic[], Error>({
    queryKey: ['ai-pulse', 'my-topics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ai_pulse_my_topics');
      if (error) throw error;
      return (data as Topic[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

// ── grade readout (the four checks + score + tips) ──────────────────────────

function GradeView({ grade, status }: { grade: Grade; status: string }) {
  if (status === 'pending') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Grading your prompt…
      </p>
    );
  }
  if (status === 'error' || !grade) {
    return <p className="text-sm text-muted-foreground">We couldn&apos;t grade this one. Try building it again.</p>;
  }
  const checks: Array<[string, boolean]> = [
    ['Role', !!grade.has_role],
    ['Context', !!grade.has_context],
    ['Task', !!grade.has_task],
    ['Output format', !!grade.has_format],
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {checks.map(([label, ok]) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1 text-xs ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
          >
            {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
            {label}
          </span>
        ))}
        {typeof grade.score === 'number' && (
          <Badge variant="secondary" className="ml-auto">{grade.score}/100</Badge>
        )}
      </div>
      {Array.isArray(grade.tips) && grade.tips.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {grade.tips.slice(0, 3).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────────────────

export function PromptBuilderCard({ cycleId }: { cycleId?: string | null }) {
  const { data: enabled } = usePromptBuildEnabled();
  const [parts, setParts] = useState<Record<PartKey, string>>({ ...EMPTY });
  const qc = useQueryClient();
  const builds = useMyBuilds(cycleId);
  const { data: topics } = useMyTopics();
  const topic = topics?.[0] ?? null; // finest first (course over programme)

  const preview = useMemo(() => assemble(parts), [parts]);
  const filledCount = PARTS.filter((p) => parts[p.key].trim()).length;

  const submit = useMutation<void, Error, void>({
    mutationFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { error } = await supabase.rpc('fn_ai_pulse_submit_prompt_build', {
        p_payload: {
          cycle_id: cycleId ?? null,
          topic_type: topic?.topic_type ?? null,
          topic_id: topic?.topic_id ?? null,
          parts,
          assembled_prompt: preview,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setParts({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ['ai-pulse', 'my-prompt-builds'] });
      toast.success('Submitted! We’re grading your prompt…');
    },
    onError: (e) => {
      logger.error(MODULE, 'submit failed', e);
      toast.error(submitErrorMessage(e));
    },
  });

  // DARK gate: render nothing until the feature is switched on.
  if (enabled !== true) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" aria-hidden /> Build a prompt
        </CardTitle>
        <CardDescription>
          Great AI answers come from great prompts. Build one from four parts — your prompt appears below as you type, then get instant feedback.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {PARTS.map((p) => (
            <div key={p.key} className="space-y-1">
              <Label htmlFor={`part-${p.key}`} className="text-xs font-medium">
                {p.label}
              </Label>
              {p.key === 'context' ? (
                <Textarea
                  id={`part-${p.key}`}
                  rows={2}
                  placeholder={p.eg}
                  value={parts[p.key]}
                  onChange={(e) => setParts((s) => ({ ...s, [p.key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`part-${p.key}`}
                  placeholder={p.eg}
                  value={parts[p.key]}
                  onChange={(e) => setParts((s) => ({ ...s, [p.key]: e.target.value }))}
                />
              )}
              <p className="text-[11px] text-muted-foreground">{p.hint}</p>
            </div>
          ))}
        </div>

        {/* Signature: the live preview — the four parts assembling into a real prompt. */}
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3" aria-hidden /> Your prompt
          </p>
          {preview ? (
            <p className="text-sm leading-relaxed">{preview}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Fill in the parts above and your prompt takes shape here.</p>
          )}
          {topic && preview && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Files under <span className="font-medium text-foreground">{topic.topic_label}</span> — a top-scoring prompt can graduate here for other learners to reuse.
            </p>
          )}
        </div>

        <Button
          onClick={() => submit.mutate()}
          disabled={filledCount < 2 || submit.isPending}
          className="w-full sm:w-auto"
        >
          {submit.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="mr-2 h-4 w-4" aria-hidden />
          )}
          Submit for feedback
        </Button>

        {/* Past builds + grades */}
        {(builds.data?.length ?? 0) > 0 && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Your recent prompts</p>
            {builds.data!.slice(0, 3).map((b) => (
              <div key={b.id} className="space-y-1.5 rounded-md border p-3">
                <p className="text-sm leading-relaxed">{b.assembled_prompt}</p>
                <GradeView grade={b.grade} status={b.grade_status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
