'use client';

/**
 * Campus Living guide — client lane detection (shared by the page + the FAB).
 *
 * ONE place computes the viewer's own lane + the lanes they may switch to, so
 * the full-page guide and the "?Help" FAB can never disagree on the
 * fail-CLOSED gating. Mirrors MyJKKN's client auth surface (usePermissions +
 * profile.role) — the same one CampusLivingResidentGuard uses.
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
    // can() its REQUIRES key. The resident lane has no `requires` → always on.
    const visible = GUIDE_PERSONAS.filter((p) => {
      const req = GUIDES.lanes[p].requires;
      return isSuperAdmin || !req || can(req);
    });
    // Most-specific lane (GUIDE_PERSONAS is admin→…→resident), EXCEPT a
    // student-role resident always opens on Resident even with a stray staff key.
    const own: GuidePersona = isStudent
      ? 'resident'
      : visible.find((p) => p !== 'resident') ?? 'resident';
    return { own, visible, isLoading };
  }, [isSuperAdmin, can, isStudent, isLoading]);
}
