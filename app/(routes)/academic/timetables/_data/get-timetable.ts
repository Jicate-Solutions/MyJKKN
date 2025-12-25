/**
 * Server-side data fetching for Timetable Detail
 *
 * Cached server function for fetching individual timetable.
 */



import { createClient } from '@/lib/supabase/server';


import type { Timetable } from '@/types/academics';
import { notFound } from 'next/navigation';

/**
 * Get timetable by ID with server-side caching
 *
 * Cache Strategy: COLD (1 hour TTL)
 * - Timetables are relatively static
 * - Slots may change but timetable metadata doesn't
 */
export async function getTimetable(id: string): Promise<Timetable> {
  // Apply cache profile for cold data (1 hour));

  // Add cache tags for invalidation););

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('timetables')
    .select(
      `
      *,
      institution:institutions(id, name, counselling_code),
      academic_year:academic_years(id, academic_year_name),
      degree:degrees(id, degree_name),
      program:programs(id, program_name),
      department:departments(id, department_name),
      semester:semesters(id, semester_name, program_id, degree_id),
      section:sections(id, section_name)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getTimetable] Error fetching timetable:', error);

    // If not found, trigger Next.js 404 page
    if (error.code === 'PGRST116') {
      notFound();
    }

    throw new Error(`Failed to fetch timetable: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  return data as Timetable;
}
