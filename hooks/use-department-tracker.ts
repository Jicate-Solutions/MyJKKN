// hooks/use-department-tracker.ts
// React hooks for Solution Department Tracker

import { useState, useEffect, useCallback } from 'react';
import {
  DepartmentTrackerService,
  type SolutionDepartmentWithDetails,
  type DepartmentSummary,
  type DepartmentRevenue,
  type DepartmentStatusHistory,
  type DepartmentTarget,
  type SolutionTypeRecord,
  type DepartmentStatus,
  type DepartmentListFilters,
} from '@/lib/services/solutions/department-tracker-service';

// ============================================
// DEPARTMENT LIST HOOK
// ============================================

export function useSolutionDepartments(filters: DepartmentListFilters = {}) {
  const [departments, setDepartments] = useState<SolutionDepartmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await DepartmentTrackerService.listDepartments(filters);
      setDepartments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.institution_id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { departments, loading, error, refresh: fetch };
}

// ============================================
// DEPARTMENT DETAIL HOOK
// ============================================

export function useSolutionDepartment(id: string | null) {
  const [department, setDepartment] = useState<SolutionDepartmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) {
      setDepartment(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await DepartmentTrackerService.getDepartment(id);
      setDepartment(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load department');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { department, loading, error, refresh: fetch };
}

// ============================================
// SUMMARY HOOK
// ============================================

export function useDepartmentSummary() {
  const [summary, setSummary] = useState<DepartmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.getSummary();
      setSummary(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { summary, loading, error, refresh: fetch };
}

// ============================================
// REVENUE LIST HOOK
// ============================================

export function useDepartmentRevenueList(quarter?: string) {
  const [revenues, setRevenues] = useState<DepartmentRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.getDepartmentRevenueList(quarter);
      setRevenues(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown: ' + String(err));
    } finally {
      setLoading(false);
    }
  }, [quarter]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { revenues, loading, error, refresh: fetch };
}

// ============================================
// LEADERBOARD HOOK
// ============================================

export function useDepartmentLeaderboard(limit = 5, quarter?: string) {
  const [leaderboard, setLeaderboard] = useState<DepartmentRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.getLeaderboard(limit, quarter);
      setLeaderboard(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [limit, quarter]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { leaderboard, loading, error, refresh: fetch };
}

// ============================================
// QUARTERLY TREND HOOK
// ============================================

export function useQuarterlyTrend(quarters = 4) {
  const [trend, setTrend] = useState<{ quarter: string; revenue: number; active_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.getQuarterlyTrend(quarters);
      setTrend(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trend');
    } finally {
      setLoading(false);
    }
  }, [quarters]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { trend, loading, error, refresh: fetch };
}

// ============================================
// STATUS HISTORY HOOK
// ============================================

export function useDepartmentStatusHistory(solutionDepartmentId: string | null) {
  const [history, setHistory] = useState<DepartmentStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!solutionDepartmentId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.getStatusHistory(solutionDepartmentId);
      setHistory(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [solutionDepartmentId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { history, loading, error, refresh: fetch };
}

// ============================================
// TARGETS HOOK
// ============================================

export function useDepartmentTargets(solutionDepartmentId: string | null) {
  const [targets, setTargets] = useState<DepartmentTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!solutionDepartmentId) {
      setTargets([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.getDepartmentTargets(solutionDepartmentId);
      setTargets(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load targets');
    } finally {
      setLoading(false);
    }
  }, [solutionDepartmentId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const setTarget = useCallback(
    async (quarter: string, targetRevenue: number, notes?: string, setBy?: string) => {
      if (!solutionDepartmentId) return;
      await DepartmentTrackerService.setTarget(solutionDepartmentId, quarter, targetRevenue, notes, setBy);
      await fetch();
    },
    [solutionDepartmentId, fetch]
  );

  return { targets, loading, error, refresh: fetch, setTarget };
}

// ============================================
// SOLUTION TYPES HOOK
// ============================================

export function useSolutionTypes(activeOnly = true) {
  const [types, setTypes] = useState<SolutionTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const data = await DepartmentTrackerService.listSolutionTypes(activeOnly);
      setTypes(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load solution types');
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createType = useCallback(
    async (input: { name: string; slug: string; description?: string; icon?: string; color?: string }) => {
      const created = await DepartmentTrackerService.createSolutionType(input);
      await fetch();
      return created;
    },
    [fetch]
  );

  const updateType = useCallback(
    async (id: string, updates: Partial<Pick<SolutionTypeRecord, 'name' | 'description' | 'icon' | 'color' | 'is_active'>>) => {
      const updated = await DepartmentTrackerService.updateSolutionType(id, updates);
      await fetch();
      return updated;
    },
    [fetch]
  );

  return { types, loading, error, refresh: fetch, createType, updateType };
}

// Re-export types for convenience
export type {
  SolutionDepartmentWithDetails,
  DepartmentSummary,
  DepartmentRevenue,
  DepartmentStatusHistory,
  DepartmentTarget,
  SolutionTypeRecord,
  DepartmentStatus,
};
