// Campus-living hostel leave types hook.
//
// The CRUD hook (useHostelLeaveTypes) was retired with the campus-living
// leave-types settings page — leave type management now lives on the global
// Learner Leave Types list (hooks/learners/use-learner-leave-types.ts).
// This file keeps only the active-only selector still used by the gate-pass
// request/new forms.

import { useState, useEffect } from 'react';
import { HostelLeaveTypeService } from '@/lib/services/campus-living/hostel-leave-type-service';
import type { HostelLeaveType } from '@/types/hostel-leave-types';
import { logger } from '@/lib/utils/enhanced-logger';

/** Active-only hook for the leave-request form selector. */
export function useActiveHostelLeaveTypes() {
  const [hostelLeaveTypes, setHostelLeaveTypes] = useState<HostelLeaveType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const rows = await HostelLeaveTypeService.getActiveHostelLeaveTypes();
        if (!cancelled) setHostelLeaveTypes(rows);
      } catch (err) {
        logger.error('campus-living/leave-types', 'Error fetching active', err);
        if (!cancelled) setHostelLeaveTypes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { hostelLeaveTypes, loading };
}
