// lib/services/live-poll/hr-poll-service.ts
// HR-training live poll — thin client over the shared Live Poll engine (Phase C,
// 20260704120000_live_poll_engine_phase_c_training.sql). HR trainees are STAFF, not
// learners, so the ANSWER side is STAFF-keyed and uses HR-specific RPCs
// (hr_get_for_answering / hr_question_totals_for_staff / hr_poll_for_staff) — the shared
// learner RPCs resolve get_my_learner_id() which is NULL for staff. Votes are recorded
// with answerer_staff_id (polymorphic answerer). HOST CREATE/OPEN/GET are HR-specific;
// HOST CLOSE/SET_CURRENT/TOTALS reuse the shared poll-keyed RPCs. context_id =
// hr_training_sessions.id. HR has NO loop bridge (staff have no session_feedback).
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PollQuestionDraft, ClassPollStructure, PollTotals,
  PollForAnswering, PollAnswer, LearnerQuestionTotals,
} from './class-poll-service';

const getSupabase = (): any => createClientSupabaseClient();

export interface OpenHrPollForStaff {
  poll_id: string; context_id: string; session_id: string; session_title: string | null;
  auto_close_at: string; already_answered: boolean;
}
export interface HrPollResponder {
  staff_id: string; staff_code: string | null; staff_name: string | null;
  questions_answered: number; answered_at: string;
}

export class HrPollService {
  // ── Host (HR-specific) ──
  static async getPoll(sessionId: string): Promise<ClassPollStructure | null> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_get_hr_poll', { p_session_id: sessionId });
    if (error) throw error;
    return (data as ClassPollStructure) ?? null;
  }
  static async upsertPoll(sessionId: string, questions: PollQuestionDraft[]): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_upsert_hr_poll', { p_session_id: sessionId, p_questions: questions });
    if (error) throw error;
    return data as string;
  }
  static async openPoll(pollId: string) {
    const { data, error } = await getSupabase().rpc('fn_live_poll_open_hr_poll', { p_poll_id: pollId });
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
  static async getResponders(pollId: string): Promise<HrPollResponder[]> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_hr_responders', { p_poll_id: pollId });
    if (error) throw error;
    return (data as HrPollResponder[]) ?? [];
  }
  // ── Staff trainee (staff-keyed RPCs) ──
  static async getMyOpenPolls(): Promise<OpenHrPollForStaff[]> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_hr_poll_for_staff');
    if (error) throw error;
    return (data as OpenHrPollForStaff[]) ?? [];
  }
  static async getForAnswering(pollId: string): Promise<PollForAnswering | null> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_hr_get_for_answering', { p_poll_id: pollId });
    if (error) throw error;
    return (data as PollForAnswering) ?? null;
  }
  static async submit(pollId: string, answers: PollAnswer[]): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_submit_poll_response', { p_poll_id: pollId, p_answers: answers });
    if (error) throw error;
  }
  static async getStaffQuestionTotals(pollId: string): Promise<LearnerQuestionTotals | null> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_hr_question_totals_for_staff', { p_poll_id: pollId });
    if (error) throw error;
    return (data as LearnerQuestionTotals) ?? null;
  }
}
