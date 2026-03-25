/**
 * Convert 24-hour time format to 12-hour format with AM/PM
 * @param time24 - Time in 24-hour format (e.g., "14:30", "09:00")
 * @returns Time in 12-hour format with AM/PM (e.g., "2:30 PM", "9:00 AM")
 */
export function convertTo12HourFormat(time24: string | undefined | null): string {
  if (!time24) return '';
  
  try {
    // Parse the time string
    const [hoursStr, minutesStr] = time24.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr || '00';
    
    // Handle invalid input
    if (isNaN(hours)) return time24;
    
    // Determine AM/PM
    const period = hours >= 12 ? 'PM' : 'AM';
    
    // Convert to 12-hour format
    if (hours === 0) {
      hours = 12; // Midnight
    } else if (hours > 12) {
      hours = hours - 12;
    }
    
    // Format the time string
    return `${hours}:${minutes} ${period}`;
  } catch (error) {
    // Return original string if parsing fails
    return time24;
  }
}

/**
 * Convert a time range from 24-hour to 12-hour format
 * @param startTime - Start time in 24-hour format
 * @param endTime - End time in 24-hour format
 * @returns Time range in 12-hour format (e.g., "9:00 AM - 10:30 AM")
 */
export function formatTimeRange(
  startTime: string | undefined | null,
  endTime: string | undefined | null
): string {
  const start = convertTo12HourFormat(startTime);
  const end = convertTo12HourFormat(endTime);
  
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  
  return `${start} - ${end}`;
}

/**
 * Get formatted time for display
 * @param time24 - Time in 24-hour format
 * @returns Formatted time for display
 */
export function getDisplayTime(time24: string | undefined | null): string {
  const formatted = convertTo12HourFormat(time24);
  return formatted || 'N/A';
}