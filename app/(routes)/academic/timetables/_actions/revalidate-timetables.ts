'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server Action to revalidate timetables cache
 *
 * FIX: 2026-02-05 - Added to properly invalidate Next.js cache after timetable deletion
 * This ensures the timetables list updates immediately without showing deleted items
 */
export async function revalidateTimetables() {
  try {
    // Revalidate the timetables list page
    revalidatePath('/academic/timetables');

    // Also revalidate any dynamic timetable detail pages
    revalidatePath('/academic/timetables/[id]', 'page');

    return { success: true };
  } catch (error) {
    console.error('[revalidateTimetables] Error:', error);
    return { success: false, error: 'Failed to revalidate cache' };
  }
}
