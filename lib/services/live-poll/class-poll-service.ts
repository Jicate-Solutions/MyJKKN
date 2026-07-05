// lib/services/live-poll/class-poll-service.ts
// Class-session live poll — thin client over the shared Live Poll engine RPCs.
// The ANSWER/results RPCs (get_for_answering / submit / totals / responders /
// set_current / close / learner_question_totals) are the SHARED generic engine
// RPCs (they route by context_type through the dispatchers, Phase A) — so a class
// poll uses the exact same word-cloud / scale / realtime / k>=3 anonymity machinery
// as induction. Only CREATE / OPEN / GET-by-class-grain / learner-DISCOVERY are
// class-specific (Phase B). A class poll's answers are BRIDGED into session_feedback
// (source=live_poll) by fn_induction_submit_poll_response so the SCF loop keeps being
// fed — see 20260704110000_live_poll_engine_phase_b_class_session.sql.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export type PollQuestionKind = 'single' | 'multi' | 'scale' | 'wordcloud';
// A question's role in the SCF feedback loop. The three loop questions are what the
// bridge mirrors into session_feedback; loop_role=null questions are display-only.
// 'fink' is the curriculum-aware rotating question (Phase 1): it is LOCKED in the
// builder like a loop question, but the submit bridge ignores it, so it records votes
// and feeds nothing yet (INERT — spec #21; the PDE Fink feed is Phase 3).
export type PollLoopRole = 'understood' | 'free_text' | 'checklist' | 'fink' | null;

export interface PollOptionDraft { id?: string; label: string; position: number; option_key?: string | null }
export interface PollQuestionDraft {
  id?: string; prompt: string; kind: PollQuestionKind; position: number; options: PollOptionDraft[];
  scale_min_label?: string | null; scale_max_label?: string | null;
  loop_role?: PollLoopRole;
  scale_min?: number; scale_max?: number;   // builder-local; options generated on save
}

export interface ClassPollStructure {
  id: string; context_id: string; status: 'draft' | 'open' | 'closed';
  auto_close_at: string | null; has_votes: boolean; current_question_id: string | null;
  questions: {
    id: string; prompt: string; kind: PollQuestionKind; position: number; loop_role: PollLoopRole;
    scale_min_label?: string | null; scale_max_label?: string | null;
    options: { id: string; label: string; position: number; option_key: string | null }[];
  }[];
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
export interface OpenClassPollForLearner {
  poll_id: string; context_id: string; timetable_id: string; attendance_date: string; period_id: string;
  course_code: string | null; course_name: string | null; auto_close_at: string; already_answered: boolean;
}
export interface PollForAnswering {
  poll_id: string;
  questions: { id: string; prompt: string; kind: PollQuestionKind;
               scale_min_label?: string | null; scale_max_label?: string | null;
               options: { id: string; label: string }[] }[];
  my_answers: Record<string, string[]>;
  current_question_id: string | null; question_index: number | null; question_total: number;
}
export interface PollAnswer { question_id: string; option_ids?: string[]; text?: string }
export interface LearnerQuestionTotals {
  question_id: string; prompt: string; response_count: number; suppressed: boolean;
  options: { id: string; label: string; count: number | null }[];
}

/** The class grain — a class poll is keyed by (attendance_date, timetable_id, period_id). */
export interface ClassKey { attendanceDate: string; timetableId: string; periodId: string }

export class ClassPollService {
  // ── Host (class-specific) ──
  static async getPoll(k: ClassKey): Promise<ClassPollStructure | null> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_get_class_poll', {
      p_attendance_date: k.attendanceDate, p_timetable_id: k.timetableId, p_period_id: k.periodId,
    });
    if (error) throw error;
    return (data as ClassPollStructure) ?? null;
  }
  static async upsertPoll(k: ClassKey, questions: PollQuestionDraft[]): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_upsert_class_poll', {
      p_attendance_date: k.attendanceDate, p_timetable_id: k.timetableId, p_period_id: k.periodId, p_questions: questions,
    });
    if (error) throw error;
    return data as string;
  }
  static async openPoll(pollId: string) {
    const { data, error } = await getSupabase().rpc('fn_live_poll_open_class_poll', { p_poll_id: pollId });
    if (error) throw error;
    return data;
  }
  // ── Host (shared generic engine RPCs; context-routed) ──
  static async closePoll(pollId: string) {
    const { error } = await getSupabase().rpc('fn_induction_close_session_poll', { p_poll_id: pollId });
    if (error) throw error;
  }
  static async getTotals(pollId: string): Promise<PollTotals | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_totals', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollTotals) ?? null;
  }
  static async setCurrentQuestion(pollId: string, questionId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_set_current_poll_question', { p_poll_id: pollId, p_question_id: questionId });
    if (error) throw error;
  }
  static async getResponders(pollId: string): Promise<PollResponder[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_session_poll_responders', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollResponder[]) ?? [];
  }
  // ── Learner ──
  static async getMyOpenPolls(): Promise<OpenClassPollForLearner[]> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_class_poll_for_learner');
    if (error) throw error;
    return (data as OpenClassPollForLearner[]) ?? [];
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
  static async getLearnerQuestionTotals(pollId: string): Promise<LearnerQuestionTotals | null> {
    const { data, error } = await getSupabase().rpc('fn_induction_poll_question_totals_for_learner', { p_poll_id: pollId });
    if (error) throw error;
    return (data as LearnerQuestionTotals) ?? null;
  }
}
