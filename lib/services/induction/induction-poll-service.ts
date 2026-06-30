// lib/services/induction/induction-poll-service.ts
// Per-session induction opinion polls — thin client over the DEFINER RPCs in
// 20260630210100/210200. Host + learner methods together (two ends of one feature),
// mirroring induction-pulse-service.ts.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export interface PollOptionDraft { id?: string; label: string; position: number }
export interface PollQuestionDraft { id?: string; prompt: string; kind: 'single' | 'multi'; position: number; options: PollOptionDraft[] }

export interface PollStructure {
  id: string; session_id: string; status: 'draft' | 'open' | 'closed';
  auto_close_at: string | null; has_votes: boolean;
  questions: { id: string; prompt: string; kind: 'single' | 'multi'; position: number;
               options: { id: string; label: string; position: number }[] }[];
}
export interface PollTotals {
  status: 'draft' | 'open' | 'closed'; auto_close_at: string | null;
  enrolled_count: number; response_count: number; suppressed: boolean;
  questions: { id: string; prompt: string; kind: 'single' | 'multi'; response_count: number;
               options: { id: string; label: string; count: number | null }[] }[];
}
export interface OpenPollForLearner {
  poll_id: string; session_id: string; event_id: string; event_name: string | null;
  title: string | null; day_number: number | null; auto_close_at: string; already_answered: boolean;
}
export interface PollForAnswering {
  poll_id: string;
  questions: { id: string; prompt: string; kind: 'single' | 'multi'; options: { id: string; label: string }[] }[];
  my_answers: Record<string, string[]>;
}

export class InductionPollService {
  // ── Host ──
  static async upsertPoll(sessionId: string, questions: PollQuestionDraft[]): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_induction_upsert_session_poll', {
      p_session_id: sessionId, p_questions: questions,
    });
    if (error) throw error;
    return data as string;
  }
  static async getPoll(sessionId: string): Promise<PollStructure | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_get_session_poll', { p_session_id: sessionId });
    if (error) throw error;
    return (data as PollStructure) ?? null;
  }
  static async openPoll(sessionId: string) {
    const { data, error } = await getSupabase().rpc('fn_induction_open_session_poll', { p_session_id: sessionId });
    if (error) throw error;
    return data;
  }
  static async closePoll(pollId: string) {
    const { data, error } = await getSupabase().rpc('fn_induction_close_session_poll', { p_poll_id: pollId });
    if (error) throw error;
    return data;
  }
  static async getTotals(pollId: string): Promise<PollTotals | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_totals', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollTotals) ?? null;
  }
  // ── Learner ──
  static async getMyOpenPolls(): Promise<OpenPollForLearner[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_for_learner');
    if (error) throw error;
    return (data as OpenPollForLearner[]) ?? [];
  }
  static async getForAnswering(pollId: string): Promise<PollForAnswering | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_get_poll_for_answering', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollForAnswering) ?? null;
  }
  static async submit(pollId: string, answers: { question_id: string; option_ids: string[] }[]): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_submit_poll_response', { p_poll_id: pollId, p_answers: answers });
    if (error) throw error;
  }
}
