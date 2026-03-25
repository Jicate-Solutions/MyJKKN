import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

export interface DepartmentAccessHook {
  departmentId: string | null;
  loading: boolean;
  error: string | null;
  hasDepartmentRestriction: boolean;
  hasAccessToDepartment: (departmentId: string) => boolean;
  canAccessAllDepartments: boolean;
  createDepartmentFilter: <T extends { department_id?: string }>(
    items: T[]
  ) => T[];
  getDepartmentFilterClause: () => string;
}

export function useUserDepartmentAccess(): DepartmentAccessHook {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  // Get user's department ID from profile
  const departmentId = profile?.department_id || null;

  useEffect(() => {
    // Simple loading state based on profile availability
    setLoading(!profile);
    setError(null);
  }, [profile]);

  const canAccessAllDepartments = useCallback((): boolean => {
    // Super admins and users with no department restriction can access all
    return isSuperAdmin || departmentId === null;
  }, [isSuperAdmin, departmentId]);

  const hasDepartmentRestriction = useCallback((): boolean => {
    return !canAccessAllDepartments();
  }, [canAccessAllDepartments]);

  const hasAccessToDepartment = useCallback(
    (targetDepartmentId: string): boolean => {
      if (canAccessAllDepartments()) {
        return true;
      }
      return departmentId === targetDepartmentId;
    },
    [canAccessAllDepartments, departmentId]
  );

  const createDepartmentFilter = useCallback(
    <T extends { department_id?: string }>(items: T[]): T[] => {
      if (canAccessAllDepartments()) {
        return items;
      }

      if (!departmentId) {
        return [];
      }

      return items.filter((item) => item.department_id === departmentId);
    },
    [canAccessAllDepartments, departmentId]
  );

  const getDepartmentFilterClause = useCallback((): string => {
    if (canAccessAllDepartments()) {
      return '1=1'; // No filtering needed
    }

    if (!departmentId) {
      return '1=0'; // No access to any department
    }

    return `department_id = '${departmentId}'`;
  }, [canAccessAllDepartments, departmentId]);

  return {
    departmentId,
    loading,
    error,
    hasDepartmentRestriction: hasDepartmentRestriction(),
    hasAccessToDepartment,
    canAccessAllDepartments: canAccessAllDepartments(),
    createDepartmentFilter,
    getDepartmentFilterClause
  };
}
