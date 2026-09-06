// @vitest-environment jsdom

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBosPermissions, useHasBosPermission } from '@/hooks/bos/use-bos-permissions';
import { useAuth } from '@/hooks/use-auth-provider';
import { SYSTEM_ROLES } from '@/types/auth';

// Mock the auth hook
vi.mock('@/hooks/use-auth-provider');

const mockUseAuth = vi.mocked(useAuth);

describe('useBosPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when user is not authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        profile: null,
        isLoading: false,
        error: null,
      });
    });

    it('should return all permissions as false', () => {
      const { result } = renderHook(() => useBosPermissions());

      expect(result.current.canView).toBe(false);
      expect(result.current.canCreate).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canRevise).toBe(false);
      expect(result.current.canDuplicate).toBe(false);
      expect(result.current.canExport).toBe(false);
      expect(result.current.canManageTaxonomy).toBe(false);
      expect(result.current.hasAnyPermission).toBe(false);
    });
  });

  describe('when user is super admin', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        profile: {
          id: 'user-1',
          email: 'admin@example.com',
          full_name: 'Admin User',
          role: SYSTEM_ROLES.SUPER_ADMIN,
          is_super_admin: true,
          is_active: true,
          profile_completed: true,
          institution_id: 'inst-1',
          department_id: null,
          learner_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login: null,
          phone_number: null,
          bio: null,
          gender: null,
          designation: null,
          avatar_url: null,
        },
        isLoading: false,
        error: null,
      });
    });

    it('should return all permissions as true', () => {
      const { result } = renderHook(() => useBosPermissions());

      expect(result.current.canView).toBe(true);
      expect(result.current.canCreate).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canDelete).toBe(true);
      expect(result.current.canRevise).toBe(true);
      expect(result.current.canDuplicate).toBe(true);
      expect(result.current.canExport).toBe(true);
      expect(result.current.canManageTaxonomy).toBe(true);
      expect(result.current.hasAnyPermission).toBe(true);
    });
  });

  describe('when user has custom merged permissions', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        profile: {
          id: 'user-2',
          email: 'coordinator@example.com',
          full_name: 'BoS Coordinator',
          role: SYSTEM_ROLES.FACULTY,
          is_active: true,
          profile_completed: true,
          institution_id: 'inst-1',
          department_id: null,
          learner_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login: null,
          phone_number: null,
          bio: null,
          gender: null,
          designation: null,
          avatar_url: null,
          merged_permissions: {
            'academic.bos-syllabus.view': true,
            'academic.bos-syllabus.create': true,
            'academic.bos-syllabus.edit': true,
            'academic.bos-syllabus.delete': false,
            'academic.bos-syllabus.revise': true,
            'academic.bos-syllabus.duplicate': true,
            'academic.bos-syllabus.export': true,
            'academic.bos-syllabus.manage_taxonomy': false,
          },
        },
        isLoading: false,
        error: null,
      });
    });

    it('should use merged permissions over default role permissions', () => {
      const { result } = renderHook(() => useBosPermissions());

      expect(result.current.canView).toBe(true);
      expect(result.current.canCreate).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canRevise).toBe(true);
      expect(result.current.canDuplicate).toBe(true);
      expect(result.current.canExport).toBe(true);
      expect(result.current.canManageTaxonomy).toBe(false);
      expect(result.current.hasAnyPermission).toBe(true);
    });
  });

  describe('when user is Principal', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        profile: {
          id: 'user-3',
          email: 'principal@example.com',
          full_name: 'Principal',
          role: SYSTEM_ROLES.PRINCIPAL,
          is_active: true,
          profile_completed: true,
          institution_id: 'inst-1',
          department_id: null,
          learner_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login: null,
          phone_number: null,
          bio: null,
          gender: null,
          designation: null,
          avatar_url: null,
        },
        isLoading: false,
        error: null,
      });
    });

    it('should have view-only permissions', () => {
      const { result } = renderHook(() => useBosPermissions());

      expect(result.current.canView).toBe(true);
      expect(result.current.canCreate).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canRevise).toBe(false);
      expect(result.current.canDuplicate).toBe(false);
      expect(result.current.canExport).toBe(true);
      expect(result.current.canManageTaxonomy).toBe(false);
      expect(result.current.hasAnyPermission).toBe(false);
    });
  });

  describe('when user is HOD', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        profile: {
          id: 'user-4',
          email: 'hod@example.com',
          full_name: 'Head of Department',
          role: SYSTEM_ROLES.HOD,
          is_active: true,
          profile_completed: true,
          institution_id: 'inst-1',
          department_id: 'dept-1',
          learner_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login: null,
          phone_number: null,
          bio: null,
          gender: null,
          designation: null,
          avatar_url: null,
        },
        isLoading: false,
        error: null,
      });
    });

    it('should have edit and revision permissions but not delete', () => {
      const { result } = renderHook(() => useBosPermissions());

      expect(result.current.canView).toBe(true);
      expect(result.current.canCreate).toBe(true);
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canRevise).toBe(true);
      expect(result.current.canDuplicate).toBe(true);
      expect(result.current.canExport).toBe(true);
      expect(result.current.canManageTaxonomy).toBe(false);
      expect(result.current.hasAnyPermission).toBe(true);
    });
  });
});

describe('useHasBosPermission', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      profile: {
        id: 'user-5',
        email: 'faculty@example.com',
        full_name: 'Faculty',
        role: SYSTEM_ROLES.FACULTY,
        is_active: true,
        profile_completed: true,
        institution_id: 'inst-1',
        department_id: null,
        learner_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: null,
        phone_number: null,
        bio: null,
        gender: null,
        designation: null,
        avatar_url: null,
      },
      isLoading: false,
      error: null,
    });
  });

  it('should return true for specific permissions', () => {
    const { result: createResult } = renderHook(() => useHasBosPermission('create'));
    const { result: deleteResult } = renderHook(() => useHasBosPermission('delete'));

    expect(createResult.current).toBe(true);
    expect(deleteResult.current).toBe(false);
  });
});
