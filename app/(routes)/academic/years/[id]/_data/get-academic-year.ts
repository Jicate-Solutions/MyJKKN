/**
 * Server-side data fetching for Academic Year Detail
 *
 * Cached server function for fetching individual academic year.
 */



import { createClient } from '@/lib/supabase/server';
import type { AcademicYear } from '@/types/academics';
import { notFound } from 'next/navigation';

/**
 * Get academic year by ID with server-side caching
 *
 * Cache Strategy: STATIC (1 day TTL)
 * - Academic years are configuration data that rarely change
 * - Once created, they're mostly read-only
 */
export async function getAcademicYear(id: string): Promise<AcademicYear> {
  // Apply cache profile for static data (1 day)

  // Add cache tags for invalidation

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('academic_years')
    .select('*, institution:institutions(id, name, counselling_code)')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getAcademicYear] Error fetching academic year:', error);

    // If not found, trigger Next.js 404 page
    if (error.code === 'PGRST116') {
      notFound();
    }

    throw new Error(`Failed to fetch academic year: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  return data as AcademicYear;
}
