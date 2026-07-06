// lib/services/induction/induction-poll-service.ts
// Per-session induction opinion polls — thin client over the DEFINER RPCs in
// 20260630210100/210200. Host + learner methods together (two ends of one feature),
// mirroring induction-pulse-service.ts.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

// Question kinds (v2): 'single'/'multi' = option ballots; 'scale' = numeric 1..N
// single-select (reuses the option path, labels are the numbers); 'wordcloud' =
// free-text (options minted server-side, one per distinct word).
export type PollQuestionKind = 'single' | 'multi' | 'scale' | 'wordcloud';

export interface PollOptionDraft { id?: string; label: string; position: number }
export interface PollQuestionDraft {
  id?: string; prompt: string; kind: PollQuestionKind; position: number; options: PollOptionDraft[];
  scale_min_label?: string | null; scale_max_label?: string | null;
  // Builder-local only (ignored by the RPC): the numeric scale range. Options are
  // GENERATED from this on save. Re-hydrated from the numeric option labels on load.
  scale_min?: number; scale_max?: number;
}

export interface PollStructure {
  id: string; session_id: string; status: 'draft' | 'open' | 'closed';
  auto_close_at: string | null; has_votes: boolean;
  current_question_id: string | null;
  questions: { id: string; prompt: string; kind: PollQuestionKind; position: number;
               scale_min_label?: string | null; scale_max_label?: string | null;
               options: { id: string; label: string; position: number }[] }[];
}
export interface PollTotals {
  status: 'draft' | 'open' | 'closed'; auto_close_at: string | null;
  enrolled_count: number; response_count: number; suppressed: boolean;
  questions: { id: string; prompt: string; kind: PollQuestionKind; response_count: number;
               scale_min_label?: string | null; scale_max_label?: string | null;
               options: { id: string; label: string; count: number | null }[] }[];
}
export interface PollResponder {
  learner_id: string; register_number: string | null; roll_number: string | null;
  learner_name: string | null; questions_answered: number; answered_at: string;
}
// One row per (learner x question) with the actual ballots — host-only export.
export interface PollExportRow {
  learner_id: string; register_number: string | null; roll_number: string | null;
  learner_name: string | null; gender: string | null;
  student_email: string | null; college_email: string | null; student_mobile: string | null;
  institution_name: string | null; degree_name: string | null;
  program_name: string | null; batch_name: string | null;
  question_id: string; question_position: number; question_prompt: string;
  question_kind: 'single' | 'multi'; option_labels: string[]; answered_at: string;
}
export interface OpenPollForLearner {
  poll_id: string; session_id: string; event_id: string; event_name: string | null;
  title: string | null; day_number: number | null; auto_close_at: string; already_answered: boolean;
}
export interface PollForAnswering {
  poll_id: string;
  // Coordinator-controlled: the server returns ONLY the current question.
  questions: { id: string; prompt: string; kind: PollQuestionKind;
               scale_min_label?: string | null; scale_max_label?: string | null;
               options: { id: string; label: string }[] }[];
  my_answers: Record<string, string[]>;
  current_question_id: string | null;
  question_index: number | null;
  question_total: number;
}

// One answer in a submit payload. Option kinds carry option_ids; wordcloud carries
// the free-text word.
export interface PollAnswer { question_id: string; option_ids?: string[]; text?: string }
export interface LearnerQuestionTotals {
  question_id: string; prompt: string; response_count: number; suppressed: boolean;
  options: { id: string; label: string; count: number | null }[];
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
  // Coordinator picks which question is live for learners (also extends auto-close).
  static async setCurrentQuestion(pollId: string, questionId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_set_current_poll_question', {
      p_poll_id: pollId, p_question_id: questionId,
    });
    if (error) throw error;
  }
  // Who answered (identity only, never ballots) — host-gated in the RPC.
  static async getResponders(pollId: string): Promise<PollResponder[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_responders', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollResponder[]) ?? [];
  }
  // Full ballots + learner details for the Excel export — host-gated in the RPC.
  static async getExportRows(pollId: string): Promise<PollExportRow[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_export', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollExportRow[]) ?? [];
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
  static async submit(pollId: string, answers: PollAnswer[]): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_submit_poll_response', { p_poll_id: pollId, p_answers: answers });
    if (error) throw error;
  }
  // Live counts for the CURRENT question (aggregate only, suppressed until 3 responders).
  static async getLearnerQuestionTotals(pollId: string): Promise<LearnerQuestionTotals | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_poll_question_totals_for_learner', { p_poll_id: pollId });
    if (error) throw error;
    return (data as LearnerQuestionTotals) ?? null;
  }
}
