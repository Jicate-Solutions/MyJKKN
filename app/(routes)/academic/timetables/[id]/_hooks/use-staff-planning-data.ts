import { useState, useEffect, useCallback } from 'react';
import { Timetable } from '@/types/academics';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { logger } from '@/lib/utils/enhanced-logger';

interface UseStaffPlanningDataResult {
  // Data
  staffPlanningCourses: any[];
  staffPlanningStaff: any[];

  // Loading state
  loading: boolean;

  // Actions
  refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching staff planning data
 * Loads courses and staff based on timetable hierarchy
 *
 * Fixed: 2026-02-03 - Extracted timetable properties to prevent infinite re-render loops
 */
export function useStaffPlanningData(
  timetable: Timetable | null
): UseStaffPlanningDataResult {
  const [staffPlanningCourses, setStaffPlanningCourses] = useState<any[]>([]);
  const [staffPlanningStaff, setStaffPlanningStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Extract stable primitive values from timetable to use in dependencies
  // This prevents callback recreation when timetable reference changes but values are same
  const timetableId = timetable?.id;
  const institutionId = timetable?.institution_id;
  const degreeId = timetable?.degree_id;
  const programId = timetable?.program_id;
  const departmentId = timetable?.department_id;
  const semesterId = timetable?.semester_id;
  const academicYearId = timetable?.academic_year_id;

  /**
   * Fetch staff planning data based on timetable hierarchy
   */
  const fetchStaffPlanningData = useCallback(async () => {
    if (!timetableId || !institutionId || !programId) return;

    try {
      setLoading(true);

      // Determine semester ID for staff planning
      let semesterIdForStaffPlan: string | undefined;

      // Check if semester_id is already a UUID
      if (
        typeof semesterId === 'string' &&
        semesterId.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
      ) {
        semesterIdForStaffPlan = semesterId;
      } else if (typeof semesterId === 'string') {
        // Fallback: Look up semester by name
        try {
          const semestersResponse = await SemesterService.getSemesters({
            program_id: programId,
            department_id: departmentId,
            isActive: true,
            limit: 100
          });

          const matchingSemester = semestersResponse.data.find(
            (semester) => semester.semester_name === semesterId
          );

          if (matchingSemester) {
            semesterIdForStaffPlan = matchingSemester.id;
          } else {
            logger.warn('academic/timetables', 'No matching semester found', { semesterName: semesterId });
            setStaffPlanningCourses([]);
            setStaffPlanningStaff([]);
            return;
          }
        } catch (error) {
          logger.error('academic/timetables', 'Error finding semester ID', error);
          setStaffPlanningCourses([]);
          setStaffPlanningStaff([]);
          return;
        }
      }

      if (!semesterIdForStaffPlan) {
        logger.warn('academic/timetables', 'No semester ID available - cannot match staff planning');
        setStaffPlanningCourses([]);
        setStaffPlanningStaff([]);
        return;
      }

      // Fetch consolidated staff plan
      try {
        const consolidatedPlan =
          await StaffPlanService.getConsolidatedStaffPlan(
            institutionId!,
            programId!,
            semesterIdForStaffPlan,
            academicYearId!
          );

        // Check if empty
        if (
          consolidatedPlan.total_courses === 0 &&
          consolidatedPlan.all_courses.length === 0
        ) {
          logger.warn('academic/timetables', 'Empty staff plan for this semester');
        }

        // Extract unique courses and staff
        const coursesSet = new Set<string>();
        const staffSet = new Set<string>();
        const courseDetailsMap = new Map<string, any>();
        const staffDetailsMap = new Map<string, any>();

        for (const assignment of consolidatedPlan.all_courses) {
          if (assignment.course && assignment.staff) {
            coursesSet.add(assignment.course.id);
            staffSet.add(assignment.staff.id);
            courseDetailsMap.set(assignment.course.id, assignment.course);
            staffDetailsMap.set(assignment.staff.id, assignment.staff);
          }
        }

        // Convert sets to arrays
        const coursesFromStaffPlanning = Array.from(coursesSet)
          .map((courseId) => courseDetailsMap.get(courseId))
          .filter(Boolean);

        const staffFromStaffPlanning = Array.from(staffSet)
          .map((staffId) => staffDetailsMap.get(staffId))
          .filter(Boolean);

        setStaffPlanningCourses(coursesFromStaffPlanning);
        setStaffPlanningStaff(staffFromStaffPlanning);
      } catch (error) {
        // Fallback to individual queries
        logger.warn('academic/timetables', 'Consolidated fetch failed, using fallback', error);

        const staffPlanFilters = {
          institution_id: institutionId,
          degree_id: degreeId,
          program_id: programId,
          department_id: departmentId,
          academic_year_id: academicYearId,
          semester_id: semesterIdForStaffPlan,
          isActive: true,
          limit: 10
        };

        const staffPlansResult = await StaffPlanService.getStaffPlans(
          staffPlanFilters
        );

        if (staffPlansResult.data.length === 0) {
          logger.warn('academic/timetables', 'No staff plans found');
        }

        // For now, just set empty arrays
        setStaffPlanningCourses([]);
        setStaffPlanningStaff([]);
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching staff planning data', error);
      setStaffPlanningCourses([]);
      setStaffPlanningStaff([]);
    } finally {
      setLoading(false);
    }
  }, [timetableId, institutionId, degreeId, programId, departmentId, semesterId, academicYearId]);

  // Fetch on timetable change - only when timetableId changes
  useEffect(() => {
    if (timetableId) {
      fetchStaffPlanningData();
    }
  }, [timetableId, fetchStaffPlanningData]);

  return {
    staffPlanningCourses,
    staffPlanningStaff,
    loading,
    refetch: fetchStaffPlanningData
  };
}
