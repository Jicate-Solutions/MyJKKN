'use client';

// OneMark sources — React Query hooks over the lane's own API routes.
//
// Everything goes through `/api/foundation/onemark/sources*` rather than
// straight at the table, for one reason: the rules that make this list safe —
// the key is fixed at birth, a built-in row cannot be retired, a delete is
// always refused — live on the server. A browser client talking to PostgREST
// would bypass every one of them and only meet the last wall (Lane S3's
// BEFORE DELETE trigger), which reports as a raw database error.
//
// `useOneMarkSources` is the ONE read the whole product uses for the source
// list: the management screen, the picker chips a learner sees, and any place a
// question is born. Nothing anywhere carries its own list of source names.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OneMarkSourceRow,
  OneMarkSourceWithCounts,
} from '@/lib/services/onemark/sources-service';
import type {
  BoardPaperHit,
  BoardMatchKind,
  TaggableQuestion,
} from '@/lib/services/onemark/sources-board-paper';
import type { SourceAnalyticsPayload } from '@/lib/services/onemark/sources-analytics';

export const sourceKeys = {
  all: ['onemark', 'sources'] as const,
  list: (withCounts: boolean, examId?: string) =>
    ['onemark', 'sources', 'list', withCounts, examId ?? 'all'] as const,
  boardPaper: (examId: string, year: number | null, sitting: string, search: string) =>
    ['onemark', 'sources', 'board-paper', examId, year, sitting, search] as const,
  analytics: (examId: string, year: number | null) =>
    ['onemark', 'sources', 'analytics', examId, year] as const,
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** An error that remembers the status, so a screen can tell "you may not read
 *  this" from "this broke" and render the right thing (CLAUDE.md #27). */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  });
  const body = await readJson(res);
  if (!res.ok) {
    // The server's sentence, not a status code. Every refusal in this lane
    // carries a reason and the reason is what the person needs to read.
    throw new ApiError(
      typeof body.error === 'string' ? body.error : `Request failed (${res.status})`,
      res.status,
    );
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export interface SourceListResponse {
  sources: OneMarkSourceRow[] | OneMarkSourceWithCounts[];
  unrecorded?: { total: number; active: number };
  can_manage: boolean;
}

export function useOneMarkSources(opts: { withCounts?: boolean; examId?: string } = {}) {
  const withCounts = opts.withCounts === true;
  const params = new URLSearchParams();
  if (withCounts) params.set('counts', '1');
  if (opts.examId) params.set('exam', opts.examId);
  const qs = params.toString();
  return useQuery({
    queryKey: sourceKeys.list(withCounts, opts.examId),
    queryFn: () => call<SourceListResponse>(`/api/foundation/onemark/sources${qs ? `?${qs}` : ''}`),
    staleTime: 60_000,
  });
}

export interface CreateSourceInput {
  label: string;
  description?: string | null;
  sort_order?: number;
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSourceInput) =>
      call<{ source: OneMarkSourceRow }>('/api/foundation/onemark/sources', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.all });
    },
  });
}

export interface UpdateSourceInput {
  key: string;
  label?: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...patch }: UpdateSourceInput) =>
      call<{ source: OneMarkSourceRow }>(`/api/foundation/onemark/sources/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Board-paper ticks
// ---------------------------------------------------------------------------

export interface BoardPaperResponse {
  exams: Array<{ id: string; config_key: string; display_name: string }>;
  year_range: { min: number; max: number };
  available: boolean;
  reason?: string;
  hits: BoardPaperHit[];
  questions: TaggableQuestion[];
  search_min_length?: number;
  search_limit?: number;
}

export function useBoardPaperHits(input: {
  examId: string;
  year: number | null;
  sitting: string;
  search: string;
  enabled?: boolean;
}) {
  const params = new URLSearchParams();
  if (input.examId) params.set('exam', input.examId);
  if (input.year !== null) params.set('year', String(input.year));
  if (input.sitting) params.set('sitting', input.sitting);
  if (input.search) params.set('q', input.search);
  return useQuery({
    queryKey: sourceKeys.boardPaper(input.examId, input.year, input.sitting, input.search),
    queryFn: () =>
      call<BoardPaperResponse>(`/api/foundation/onemark/sources/board-paper?${params.toString()}`),
    enabled: input.enabled !== false,
    staleTime: 30_000,
  });
}

export interface RecordHitInput {
  exam_definition_id: string;
  exam_year: number;
  sitting: string | null;
  item_id: string;
  match_kind: BoardMatchKind;
  board_qno?: number | null;
  note?: string | null;
}

export function useRecordBoardHit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordHitInput) =>
      call<{ hit: BoardPaperHit }>('/api/foundation/onemark/sources/board-paper', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.all });
    },
  });
}

export function useRemoveBoardHit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hitId: string) =>
      call<{ removed: string }>(
        `/api/foundation/onemark/sources/board-paper/${encodeURIComponent(hitId)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sourceKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// The evidence
// ---------------------------------------------------------------------------

export interface SourceAnalyticsResponse {
  exams: Array<{ id: string; config_key: string; display_name: string }>;
  year_range: { min: number; max: number };
  available: boolean;
  reason?: string;
  analytics: SourceAnalyticsPayload | null;
}

export function useSourceAnalytics(input: { examId: string; year: number | null; enabled?: boolean }) {
  const params = new URLSearchParams();
  if (input.examId) params.set('exam', input.examId);
  if (input.year !== null) params.set('year', String(input.year));
  return useQuery({
    queryKey: sourceKeys.analytics(input.examId, input.year),
    queryFn: () =>
      call<SourceAnalyticsResponse>(`/api/foundation/onemark/results/sources?${params.toString()}`),
    enabled: input.enabled !== false,
    staleTime: 60_000,
  });
}
