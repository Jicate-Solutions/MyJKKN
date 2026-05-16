// lib/services/ai-pulse/quiz-service.ts
// ============================================
// AI PULSE — QUIZ AUTHORING SERVICE
// ============================================
// Wave B.7 — backs the Quiz Authoring Console.
//
// Storage: each AI Pulse cycle's quiz lives in
//   startup_events.config.quiz JSONB
// per spec §4.4 + §5 + Q7 + Q16 (bilingual default).
//
// Shape (matches spec):
// {
//   questions: [{
//     id: string,
//     question_en: string,
//     question_ta: string,
//     options: [{ id, text_en, text_ta, is_correct }]
//   }],
//   pass_threshold_live: number,   // %
//   pass_threshold_async: number,  // %
//   schedule_publication: boolean,
//   updated_at: string
// }
// ============================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────

export interface QuizOption {
  id: string;
  text_en: string;
  text_ta: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id: string;
  question_en: string;
  question_ta: string;
  options: QuizOption[];
}

export interface QuizPayload {
  questions: QuizQuestion[];
  pass_threshold_live: number;
  pass_threshold_async: number;
  schedule_publication: boolean;
  updated_at?: string;
}

export interface CycleQuizContext {
  cycleId: string;
  title: string | null;
  recordingUrl: string | null;
  sessionEndTime: string | null;
  primaryLanguage: string;
  secondaryLanguage: string;
  quiz: QuizPayload;
}

// ── Defaults ─────────────────────────────────────────────────

export const DEFAULT_QUIZ: QuizPayload = {
  questions: [],
  pass_threshold_live: 40,
  pass_threshold_async: 60,
  schedule_publication: false,
};

const QUERY_KEY = ['ai-pulse', 'quiz'] as const;

// ── Helpers ──────────────────────────────────────────────────

function newId(prefix: string): string {
  // Stable enough for client-side row identity. Crypto fallback for older browsers.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${(crypto as Crypto).randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function makeBlankOption(): QuizOption {
  return {
    id: newId('opt'),
    text_en: '',
    text_ta: '',
    is_correct: false,
  };
}

export function makeBlankQuestion(): QuizQuestion {
  return {
    id: newId('q'),
    question_en: '',
    question_ta: '',
    options: [
      makeBlankOption(),
      makeBlankOption(),
      makeBlankOption(),
      makeBlankOption(),
    ],
  };
}

function coerceQuiz(raw: unknown): QuizPayload {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_QUIZ };
  const r = raw as Record<string, unknown>;
  const questionsRaw = Array.isArray(r.questions) ? (r.questions as unknown[]) : [];
  const questions: QuizQuestion[] = questionsRaw.map((q) => {
    const qr = (q || {}) as Record<string, unknown>;
    const optionsRaw = Array.isArray(qr.options) ? (qr.options as unknown[]) : [];
    const options: QuizOption[] = optionsRaw.map((o) => {
      const orec = (o || {}) as Record<string, unknown>;
      return {
        id: typeof orec.id === 'string' ? orec.id : newId('opt'),
        text_en: typeof orec.text_en === 'string' ? orec.text_en : '',
        text_ta: typeof orec.text_ta === 'string' ? orec.text_ta : '',
        is_correct: orec.is_correct === true,
      };
    });
    return {
      id: typeof qr.id === 'string' ? qr.id : newId('q'),
      question_en: typeof qr.question_en === 'string' ? qr.question_en : '',
      question_ta: typeof qr.question_ta === 'string' ? qr.question_ta : '',
      options: options.length > 0 ? options : [makeBlankOption(), makeBlankOption(), makeBlankOption(), makeBlankOption()],
    };
  });
  return {
    questions,
    pass_threshold_live: typeof r.pass_threshold_live === 'number' ? r.pass_threshold_live : DEFAULT_QUIZ.pass_threshold_live,
    pass_threshold_async: typeof r.pass_threshold_async === 'number' ? r.pass_threshold_async : DEFAULT_QUIZ.pass_threshold_async,
    schedule_publication: r.schedule_publication === true,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
  };
}

// ── Service ──────────────────────────────────────────────────

export class QuizService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Read the cycle row + extract its quiz payload from startup_events.config.
   * Falls back to DEFAULT_QUIZ when the cycle has no quiz authored yet.
   */
  static async getQuiz(cycleId: string): Promise<CycleQuizContext | null> {
    const { data, error } = await (this.supabase as any)
      .from('startup_events')
      .select('id, title, config, end_date, end_time, session_end_time')
      .eq('id', cycleId)
      .maybeSingle();

    if (error) {
      console.error('[ai-pulse/quiz] getQuiz failed:', error);
      return null;
    }
    if (!data) return null;

    const config = (data.config || {}) as Record<string, unknown>;
    const aiPulse = (config.ai_pulse || {}) as Record<string, unknown>;
    const quiz = coerceQuiz(config.quiz);

    return {
      cycleId: data.id,
      title: data.title ?? null,
      recordingUrl: typeof aiPulse.recording_url === 'string' ? aiPulse.recording_url : null,
      sessionEndTime:
        (typeof data.session_end_time === 'string' ? data.session_end_time : null) ||
        (typeof aiPulse.session_end_time === 'string' ? (aiPulse.session_end_time as string) : null),
      primaryLanguage: typeof aiPulse.primary_language === 'string' ? aiPulse.primary_language : 'en',
      secondaryLanguage: typeof aiPulse.secondary_language === 'string' ? aiPulse.secondary_language : 'ta',
      quiz,
    };
  }

  /**
   * Persist quiz payload to startup_events.config.quiz (JSONB merge).
   * Read-modify-write on the config column to avoid clobbering sibling keys.
   */
  static async saveQuiz(cycleId: string, payload: QuizPayload): Promise<QuizPayload> {
    const { data: row, error: readErr } = await (this.supabase as any)
      .from('startup_events')
      .select('config')
      .eq('id', cycleId)
      .maybeSingle();

    if (readErr) {
      console.error('[ai-pulse/quiz] saveQuiz read failed:', readErr);
      throw readErr;
    }

    const currentConfig = (row?.config || {}) as Record<string, unknown>;
    const nextPayload: QuizPayload = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const nextConfig = { ...currentConfig, quiz: nextPayload };

    const { error: writeErr } = await (this.supabase as any)
      .from('startup_events')
      .update({ config: nextConfig })
      .eq('id', cycleId);

    if (writeErr) {
      console.error('[ai-pulse/quiz] saveQuiz write failed:', writeErr);
      throw writeErr;
    }

    return nextPayload;
  }

  /**
   * POST to the AI-suggest stub. v1 returns 5 placeholder bilingual questions.
   * Phase 2 will wire to LLM with actual transcript fetch.
   */
  static async suggestQuestions(cycleId: string): Promise<QuizQuestion[]> {
    const res = await fetch('/api/ai-pulse/quiz/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle_id: cycleId }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI suggest failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as { questions?: QuizQuestion[] };
    return (json.questions || []).map((q) => coerceQuiz({ questions: [q] }).questions[0]);
  }
}

// ── React Query hooks ────────────────────────────────────────

export function useCycleQuiz(cycleId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, cycleId] as const,
    queryFn: () => {
      if (!cycleId) throw new Error('cycleId required');
      return QuizService.getQuiz(cycleId);
    },
    enabled: !!cycleId,
    staleTime: 30_000,
  });
}

export function useSaveQuiz(cycleId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: QuizPayload) => {
      if (!cycleId) throw new Error('cycleId required');
      return QuizService.saveQuiz(cycleId, payload);
    },
    onSuccess: () => {
      if (cycleId) {
        qc.invalidateQueries({ queryKey: [...QUERY_KEY, cycleId] });
      }
    },
  });
}

export function useSuggestQuestions(cycleId: string | undefined) {
  return useMutation({
    mutationFn: () => {
      if (!cycleId) throw new Error('cycleId required');
      return QuizService.suggestQuestions(cycleId);
    },
  });
}
