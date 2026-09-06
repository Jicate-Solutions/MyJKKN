// lib/services/live-poll/cdc-poll-service.ts
// CDC-training live poll — thin client over the shared Live Poll engine (Phase C,
// 20260704120000_live_poll_engine_phase_c_training.sql). CDC trainees are LEARNERS, so
// the ANSWER/results side reuses the SHARED learner-keyed engine RPCs unchanged
// (get_for_answering / submit / question_totals_for_learner / totals / responders /
// close / set_current) — they route by context_type ('cdc_training_session') through the
// Phase A dispatchers. Only CREATE / OPEN / GET-by-programme / learner-DISCOVERY are
// CDC-specific. context_id = cdc_training_programmes.id. CDC has NO loop bridge.
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PollQuestionDraft, ClassPollStructure, PollTotals, PollResponder,
  PollForAnswering, PollAnswer, LearnerQuestionTotals,
} from './class-poll-service';

const getSupabase = (): any => createClientSupabaseClient();

export interface OpenCdcPollForLearner {
  poll_id: string; context_id: string; programme_id: string; programme_name: string | null;
  auto_close_at: string; already_answered: boolean;
}

export class CdcPollService {
  // ── Host (CDC-specific) ──
  static async getPoll(programmeId: string): Promise<ClassPollStructure | null> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_get_cdc_poll', { p_programme_id: programmeId });
    if (error) throw error;
    return (data as ClassPollStructure) ?? null;
  }
  static async upsertPoll(programmeId: string, questions: PollQuestionDraft[]): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_upsert_cdc_poll', { p_programme_id: programmeId, p_questions: questions });
    if (error) throw error;
    return data as string;
  }
  static async openPoll(pollId: string) {
    const { data, error } = await getSupabase().rpc('fn_live_poll_open_cdc_poll', { p_poll_id: pollId });
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
  // ── Learner (shared learner-keyed RPCs + CDC discovery) ──
  static async getMyOpenPolls(): Promise<OpenCdcPollForLearner[]> {
    const { data, error } = await getSupabase().rpc('fn_live_poll_cdc_poll_for_learner');
    if (error) throw error;
    return (data as OpenCdcPollForLearner[]) ?? [];
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
