// lib/services/session-questions/session-question-service.ts
// Session question board — learners ask, learners upvote, the host answers.
// Thin client over the SECURITY DEFINER RPCs in 20260821111922_session_question_board.sql,
// mirroring induction-poll-service.ts (the one live audience system in this codebase).
//
// ONE service for every host type. A board is anchored on (host_type, host_id), so
// induction / AI Pulse / meetings all call these same methods — there is no per-module
// copy of this file, and there must never be one.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export type SessionQuestionHostType = 'induction' | 'ai_pulse' | 'meeting';
export type SessionQuestionState = 'visible' | 'blocked' | 'answered' | 'dismissed';
export type SessionQuestionBoardStatus = 'open' | 'closed';

/**
 * A board the signed-in learner belongs to (banner discovery). CLOSED boards are listed
 * too, carrying status:'closed' — a closed board goes read-only, it does not disappear.
 * It is how a learner reads the answer to the question they asked after the session ends.
 */
export interface LearnerQuestionBoard {
  board_id: string;
  host_type: SessionQuestionHostType;
  host_id: string;
  title: string | null;
  day_number: number | null;
  status: SessionQuestionBoardStatus;
  question_count: number;
  my_question_count: number;
}

/** Room-facing question. There is no learner_id here, by construction. */
export interface RoomQuestion {
  id: string;
  nickname: string;                // "Learner 7" — per-board, meaningless outside this board
  body: string;
  state: SessionQuestionState;
  vote_count: number;
  my_vote: boolean;
  is_mine: boolean;
  moderation_note: string | null;  // only ever populated for your own question
  created_at: string;
}

export interface RoomBoard {
  board_id: string;
  host_type: SessionQuestionHostType;
  host_id: string;
  status: SessionQuestionBoardStatus;
  can_ask: boolean;
  is_host: boolean;
  my_nickname: string | null;
  questions: RoomQuestion[];
}

/** Host-facing question — the same row PLUS who asked it. */
export interface HostQuestion {
  id: string;
  nickname: string;
  body: string;
  state: SessionQuestionState;
  moderation_note: string | null;
  vote_count: number;
  created_at: string;
  answered_at: string | null;
  learner_id: string;
  learner_name: string | null;
  register_number: string | null;
}

export interface HostBoard {
  board_id: string;
  status: SessionQuestionBoardStatus;
  questions: HostQuestion[];
}

// Every write returns a result object rather than throwing, so a refusal is always
// something the UI can render — never a silent failure and never a silent redirect.
export interface AskResult {
  success: boolean;
  error: string | null;
  question_id: string | null;
  state: SessionQuestionState | null;
  nickname: string | null;
}
export interface VoteResult {
  success: boolean;
  error: string | null;
  voted: boolean;
  vote_count: number;
}
export interface ActionResult {
  success: boolean;
  error: string | null;
}

/** Boards where a learner-asked question actually got ANSWERED — the success test. */
export interface AnsweredScoreboardRow {
  board_id: string;
  host_type: SessionQuestionHostType;
  host_id: string;
  institution_id: string;
  questions_asked: number;
  /** EVER answered — a question answered then dismissed still counts. This is the
   *  number the success test is measured on; a metric an ordinary host action can
   *  destroy is not a metric. */
  questions_ever_answered: number;
  /** Still showing as answered right now. Reported separately so current state and
   *  what was once true never get confused for each other. */
  questions_currently_answered: number;
  first_answered_at: string | null;
}

// strictNullChecks is OFF in this repo, so an `X | null` union does NOT narrow in an
// else-branch. Every reader below therefore names its failure value explicitly instead
// of leaning on narrowing.
const ACTION_FAILED = (message: string): ActionResult => ({ success: false, error: message });
const ASK_FAILED = (message: string): AskResult => ({
  success: false, error: message, question_id: null, state: null, nickname: null,
});
const VOTE_FAILED = (message: string): VoteResult => ({
  success: false, error: message, voted: false, vote_count: 0,
});

export class SessionQuestionService {
  // ── Host ──
  /** Switch the board on for a session (idempotent) and get its id. */
  static async ensureBoard(
    hostType: SessionQuestionHostType,
    hostId: string,
    institutionId?: string | null,
  ): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_session_question_board_ensure', {
      p_host_type: hostType, p_host_id: hostId, p_institution_id: institutionId ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** The host list — includes the real name behind each nickname. */
  static async hostList(boardId: string): Promise<HostBoard | null> {
    const { data, error } = await getSupabase().rpc('fn_session_question_host_list', { p_board_id: boardId });
    if (error) throw error;
    return (data as HostBoard) ?? null;
  }

  static async setState(
    questionId: string,
    state: SessionQuestionState,
    note?: string | null,
  ): Promise<ActionResult> {
    const { data, error } = await getSupabase().rpc('fn_session_question_set_state', {
      p_question_id: questionId, p_state: state, p_note: note ?? null,
    });
    if (error) return ACTION_FAILED(error.message ?? 'Could not update that question.');
    const result = data as ActionResult;
    if (!result) return ACTION_FAILED('Could not update that question.');
    return result;
  }

  static async setBoardStatus(boardId: string, status: SessionQuestionBoardStatus): Promise<ActionResult> {
    const { data, error } = await getSupabase().rpc('fn_session_question_set_board_status', {
      p_board_id: boardId, p_status: status,
    });
    if (error) return ACTION_FAILED(error.message ?? 'Could not update the board.');
    const result = data as ActionResult;
    if (!result) return ACTION_FAILED('Could not update the board.');
    return result;
  }

  // ── Learner / room ──
  static async myBoards(): Promise<LearnerQuestionBoard[]> {
    const { data, error } = await getSupabase().rpc('fn_session_question_boards_for_learner');
    if (error) throw error;
    return (data as LearnerQuestionBoard[]) ?? [];
  }

  static async room(boardId: string): Promise<RoomBoard | null> {
    const { data, error } = await getSupabase().rpc('fn_session_question_room', { p_board_id: boardId });
    if (error) throw error;
    return (data as RoomBoard) ?? null;
  }

  /**
   * Post a question. It goes up immediately — there is no host approval step. If the
   * auto-check refuses it, `success` is false and `error` carries the plain-English
   * reason to show the learner.
   *
   * A checker that is slow, broken or unreachable returns success:true and the question
   * is posted `visible`, marked in moderation_note as unchecked for the host to review —
   * the server-side check fails OPEN on purpose, because a board that goes blank
   * mid-session is never trusted again. If the whole call is killed (the caller's
   * statement budget, a dropped connection) the learner is TOLD via `error` and can
   * retry; that path is a visible failure, never a silent loss.
   */
  static async ask(boardId: string, body: string): Promise<AskResult> {
    const { data, error } = await getSupabase().rpc('fn_session_question_ask', {
      p_board_id: boardId, p_body: body,
    });
    if (error) return ASK_FAILED(error.message ?? 'Could not post your question.');
    const result = data as AskResult;
    if (!result) return ASK_FAILED('Could not post your question.');
    return result;
  }

  static async toggleVote(questionId: string): Promise<VoteResult> {
    const { data, error } = await getSupabase().rpc('fn_session_question_toggle_vote', {
      p_question_id: questionId,
    });
    if (error) return VOTE_FAILED(error.message ?? 'Could not record your upvote.');
    const result = data as VoteResult;
    if (!result) return VOTE_FAILED('Could not record your upvote.');
    return result;
  }

  // ── Measurement ──
  /**
   * Boards with at least one ANSWERED learner question. `since` is omitted from the
   * payload when not supplied so the RPC's own 30-day default applies — passing an
   * explicit null would make the window comparison NULL and return nothing.
   */
  static async answeredScoreboard(since?: string): Promise<AnsweredScoreboardRow[]> {
    const params = since ? { p_since: since } : {};
    const { data, error } = await getSupabase().rpc('fn_session_question_answered_scoreboard', params);
    if (error) throw error;
    return (data as AnsweredScoreboardRow[]) ?? [];
  }
}
