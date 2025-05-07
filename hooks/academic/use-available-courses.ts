'use client';

import { useState, useEffect, useCallback } from 'react';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';

interface AvailableCourse {
  id: string;
  course_name: string;
  course_code: string;
  mapping_id: string;
}

export function useAvailableCourses() {
  const [courses, setCourses] = useState<AvailableCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailableCourses = useCallback(
    async (
      institutionId: string,
      departmentId: string,
      programId: string,
      semesterId: string
    ) => {
      try {
        setLoading(true);
        setError(null);

        // Only proceed if all required IDs are provided
        if (!institutionId || !departmentId || !programId || !semesterId) {
          setCourses([]);
          return;
        }

        const result = await StaffPlanService.getAvailableCoursesFromMappings(
          institutionId,
          departmentId,
          programId,
          semesterId
        );

        setCourses(result);
      } catch (err) {
        console.error('Error fetching available courses:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    courses,
    loading,
    error,
    fetchAvailableCourses
  };
}
