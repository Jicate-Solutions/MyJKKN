import { z } from 'zod';

/**
 * Schema for validating the search parameters for the attendance reports table.
 */
export const attendanceReportsSearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),

  // Custom filters for attendance reports - hierarchical order
  institution_id: z.string().optional(),
  academic_year_id: z.string().optional(),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  faculty_id: z.string().optional(),
  attendance_status: z.enum(['all', 'completed', 'pending']).optional(),
  attendance_threshold: z.coerce.number().optional(),

  /**
   * Explicit report window, ISO yyyy-mm-dd, set by the From/To fields in the
   * filter panel.
   *
   * Kept as two plain params rather than folded into `dateRange` below: that one
   * is a stringified JSON blob the DataTable owns, and a report window that a
   * user can read off the URL and share is worth more than reusing it.
   *
   * OVERLAP, not containment: a timetable counts whenever it teaches inside the
   * window, whatever its own start and end dates. Requiring the timetable to
   * begin and finish inside the range was tried and reverted — every timetable
   * at CAS (Aided) runs to 31 Oct, so any earlier To date matched none of 26.
   */
  date_from: z.string().optional(),
  date_to: z.string().optional(),

  // Date range filter is a stringified JSON in the URL
  dateRange: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        // Ensure the parsed object has the correct structure
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'from' in parsed &&
          'to' in parsed
        ) {
          return {
            from: parsed.from ? new Date(parsed.from) : undefined,
            to: parsed.to ? new Date(parsed.to) : undefined
          };
        }
        return undefined;
      } catch {
        return undefined;
      }
    })
});

export type AttendanceReportsSearchParams = z.infer<typeof attendanceReportsSearchParamsSchema>;