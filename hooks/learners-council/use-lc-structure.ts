'use client';

// hooks/learners-council/use-lc-structure.ts
// LC-001: Learners Council Structure Management - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCStructureService } from '@/lib/services/learners-council/structure-service';
import type {
  LCTerm,
  LCMember,
  YUVAChapter,
  YUVAVertical,
  YUVAVerticalMember,
  CreateLCTermDto,
  UpdateLCTermDto,
  CreateYUVAVerticalDto,
  UpdateYUVAVerticalDto
} from '@/types/learners-council';

// ============================================================================
// QUERY KEY FACTORIES
// ============================================================================

export const lcStructureKeys = {
  terms: {
    all: ['lc-terms'] as const,
    active: () => ['lc-terms', 'active'] as const
  },
  positions: {
    all: ['lc-positions'] as const,
    filtered: (filters: Record<string, unknown>) => ['lc-positions', 'filtered', filters] as const,
    history: (positionId: string) => ['lc-positions', 'history', positionId] as const
  },
  members: {
    all: ['lc-members'] as const,
    list: (filters: Record<string, unknown>) => ['lc-members', 'list', filters] as const,
    detail: (id: string) => ['lc-members', 'detail', id] as const
  },
  chapters: {
    all: ['yuva-chapters'] as const,
    filtered: (filters: Record<string, unknown>) => ['yuva-chapters', 'filtered', filters] as const,
    detail: (id: string) => ['yuva-chapters', id] as const
  },
  verticals: {
    all: ['yuva-verticals'] as const,
    filtered: (filters: Record<string, unknown>) => ['yuva-verticals', 'filtered', filters] as const,
    members: (chapterId: string) => ['yuva-vertical-members', chapterId] as const
  }
};

// ============================================================================
// TERM HOOKS
// ============================================================================

/**
 * Fetch all LC terms
 */
export function useTerms() {
  return useQuery({
    queryKey: lcStructureKeys.terms.all,
    queryFn: () => LCStructureService.getTerms(),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Fetch the current active term
 */
export function useActiveTerm() {
  return useQuery({
    queryKey: lcStructureKeys.terms.active(),
    queryFn: () => LCStructureService.getActiveTerm(),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Create a new term
 */
export function useCreateTerm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateLCTermDto; userId: string }) =>
      LCStructureService.createTerm(data, userId),
    onSuccess: () => {
      toast.success('Term created successfully');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.terms.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create term');
    }
  });
}

/**
 * Update an existing term
 */
export function useUpdateTerm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLCTermDto }) =>
      LCStructureService.updateTerm(id, data),
    onSuccess: () => {
      toast.success('Term updated successfully');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.terms.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update term');
    }
  });
}

// ============================================================================
// POSITION HOOKS
// ============================================================================

/**
 * Fetch positions with optional filters
 */
export function usePositions(filters?: { tier?: string; category?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: filters
      ? lcStructureKeys.positions.filtered(filters as Record<string, unknown>)
      : lcStructureKeys.positions.all,
    queryFn: () => LCStructureService.getPositions(filters),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Fetch position history for a specific position
 */
export function usePositionHistory(positionId: string) {
  return useQuery({
    queryKey: lcStructureKeys.positions.history(positionId),
    queryFn: () => LCStructureService.getPositionHistory(positionId),
    enabled: !!positionId,
    staleTime: 5 * 60 * 1000
  });
}

// ============================================================================
// MEMBER HOOKS
// ============================================================================

/**
 * Fetch LC members with filters
 */
export function useLCMembers(filters: {
  term_id?: string;
  status?: string;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: lcStructureKeys.members.list(filters as Record<string, unknown>),
    queryFn: () => LCStructureService.getMembers(filters),
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Fetch a single LC member by ID
 */
export function useLCMember(id: string) {
  return useQuery({
    queryKey: lcStructureKeys.members.detail(id),
    queryFn: () => LCStructureService.getMemberById(id),
    enabled: !!id
  });
}

/**
 * Assign a member to a position
 */
export function useAssignMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      term_id: string;
      position_id: string;
      user_id: string;
      institution_id: string;
      appointment_notes?: string;
    }) => LCStructureService.assignMember(data),
    onSuccess: () => {
      toast.success('Member assigned successfully');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.members.all });
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.positions.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign member');
    }
  });
}

/**
 * Update a member's status
 */
export function useUpdateMemberStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      LCStructureService.updateMemberStatus(id, status),
    onSuccess: () => {
      toast.success('Member status updated');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.members.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update member status');
    }
  });
}

// ============================================================================
// YUVA CHAPTER HOOKS
// ============================================================================

/**
 * Fetch YUVA chapters with optional filters
 */
export function useYUVAChapters(filters?: { institution_id?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: filters
      ? lcStructureKeys.chapters.filtered(filters as Record<string, unknown>)
      : lcStructureKeys.chapters.all,
    queryFn: () => LCStructureService.getChapters(filters),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Fetch a single YUVA chapter by ID with verticals and members
 */
export function useChapterDetail(id: string) {
  return useQuery({
    queryKey: lcStructureKeys.chapters.detail(id),
    queryFn: () => LCStructureService.getChapterById(id),
    enabled: !!id
  });
}

/**
 * Create a new YUVA chapter
 */
export function useCreateChapter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      institution_id: string;
      name: string;
      description?: string;
      academic_year: string;
    }) => LCStructureService.createChapter(data),
    onSuccess: () => {
      toast.success('YUVA Chapter created successfully');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.chapters.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create chapter');
    }
  });
}

// ============================================================================
// YUVA VERTICAL HOOKS
// ============================================================================

/**
 * Fetch YUVA verticals with optional filters
 */
export function useVerticals(filters?: { type?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: filters
      ? lcStructureKeys.verticals.filtered(filters as Record<string, unknown>)
      : lcStructureKeys.verticals.all,
    queryFn: () => LCStructureService.getVerticals(filters),
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Create a new vertical
 */
export function useCreateVertical() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateYUVAVerticalDto) =>
      LCStructureService.createVertical(data),
    onSuccess: () => {
      toast.success('Vertical created successfully');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.verticals.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create vertical');
    }
  });
}

/**
 * Update a vertical
 */
export function useUpdateVertical() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateYUVAVerticalDto }) =>
      LCStructureService.updateVertical(id, data),
    onSuccess: () => {
      toast.success('Vertical updated successfully');
      queryClient.invalidateQueries({ queryKey: lcStructureKeys.verticals.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update vertical');
    }
  });
}

// ============================================================================
// YUVA VERTICAL MEMBER HOOKS
// ============================================================================

/**
 * Fetch vertical members for a chapter
 */
export function useVerticalMembers(chapterId: string) {
  return useQuery({
    queryKey: lcStructureKeys.verticals.members(chapterId),
    queryFn: () => LCStructureService.getVerticalMembers(chapterId),
    enabled: !!chapterId,
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Assign a member to a vertical
 */
export function useAssignVerticalMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      chapter_id: string;
      vertical_id: string;
      user_id: string;
      role: string;
      academic_year: string;
    }) => LCStructureService.assignVerticalMember(data),
    onSuccess: (_, variables) => {
      toast.success('Vertical member assigned successfully');
      queryClient.invalidateQueries({
        queryKey: lcStructureKeys.verticals.members(variables.chapter_id)
      });
      queryClient.invalidateQueries({
        queryKey: lcStructureKeys.chapters.detail(variables.chapter_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign vertical member');
    }
  });
}

/**
 * Remove a vertical member (soft-remove)
 */
export function useRemoveVerticalMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, chapterId }: { id: string; chapterId: string }) =>
      LCStructureService.removeVerticalMember(id),
    onSuccess: (_, variables) => {
      toast.success('Member removed from vertical');
      queryClient.invalidateQueries({
        queryKey: lcStructureKeys.verticals.members(variables.chapterId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    }
  });
}
