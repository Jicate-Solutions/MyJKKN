// hooks/audit-trail/use-audit-trail.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAuditLogs,
  getAuditLog,
  createAuditLog,
  deleteAuditLog,
  getAuditStats,
  getActivityTimeline,
  getEntityHistory,
  getUserActivity
} from '@/lib/services/audit-trail/audit-service';
import type { AuditFilters, CreateAuditLogDto } from '@/types/audit-trail';
import { useToast } from '@/hooks/use-toast';

// ==================== QUERY HOOKS ====================

export function useAuditLogs(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => getAuditLogs(filters),
    staleTime: 30 * 1000 // 30 seconds
  });
}

export function useAuditLog(id: string | undefined) {
  return useQuery({
    queryKey: ['audit-logs', id],
    queryFn: () => (id ? getAuditLog(id) : null),
    enabled: !!id,
    staleTime: 60 * 1000
  });
}

export function useAuditStats(
  filters: Omit<AuditFilters, 'limit' | 'offset'> = {}
) {
  return useQuery({
    queryKey: ['audit-stats', filters],
    queryFn: () => getAuditStats(filters),
    staleTime: 60 * 1000
  });
}

export function useActivityTimeline(
  filters: Omit<AuditFilters, 'limit' | 'offset'> = {}
) {
  return useQuery({
    queryKey: ['audit-timeline', filters],
    queryFn: () => getActivityTimeline(filters),
    staleTime: 30 * 1000
  });
}

export function useEntityHistory(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['audit-logs', 'entity', entityType, entityId],
    queryFn: () => getEntityHistory(entityType, entityId),
    enabled: !!entityType && !!entityId,
    staleTime: 60 * 1000
  });
}

export function useUserActivity(
  userId: string | undefined,
  filters: Omit<AuditFilters, 'user_id'> = {}
) {
  return useQuery({
    queryKey: ['audit-logs', 'user', userId, filters],
    queryFn: () => (userId ? getUserActivity(userId, filters) : []),
    enabled: !!userId,
    staleTime: 30 * 1000
  });
}

// ==================== MUTATION HOOKS ====================

export function useCreateAuditLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CreateAuditLogDto) => createAuditLog(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['audit-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-timeline'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create audit log',
        variant: 'destructive'
      });
    }
  });
}

export function useDeleteAuditLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteAuditLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['audit-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-timeline'] });
      toast({
        title: 'Audit log deleted',
        description: 'The audit log has been deleted successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete audit log',
        variant: 'destructive'
      });
    }
  });
}
