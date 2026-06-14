'use client';

/**
 * PDE guide — client lane detection (shared by the page + the FAB).
 *
 * ONE place computes the viewer's own lane + the lanes they may switch to, so
 * the full-page guide and the "?Help" FAB can never disagree on the
 * fail-CLOSED gating. Mirrors MyJKKN's client auth surface (usePermissions +
 * profile.role) — the same one the campus-living guide uses.
 */

import { useMemo } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { GUIDES } from './content';
import { GUIDE_PERSONAS, type GuidePersona } from './types';

export interface GuideLane {
  own: GuidePersona;
  visible: GuidePersona[];
  isLoading: boolean;
}

export function useGuideLane(): GuideLane {
  const { isSuperAdmin, can, isLoading } = usePermissions();
  const { profile } = useAuth();
  const isStudent = profile?.role === 'student';

  return useMemo<GuideLane>(() => {
    // Fail CLOSED: a gated lane shows only to super-admins or a viewer who
    // can() its REQUIRES key. The learner lane has no `requires` → always on.
    const visible = GUIDE_PERSONAS.filter((p) => {
      const req = GUIDES.lanes[p].requires;
      return isSuperAdmin || !req || can(req);
    });
    // Most-specific lane (GUIDE_PERSONAS is admin→faculty→learner), EXCEPT a
    // student-role learner always opens on Learner even with a stray staff key.
    const own: GuidePersona = isStudent
      ? 'learner'
      : visible.find((p) => p !== 'learner') ?? 'learner';
    return { own, visible, isLoading };
  }, [isSuperAdmin, can, isStudent, isLoading]);
}
