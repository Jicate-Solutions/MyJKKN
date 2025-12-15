import { Period } from '@/types/academics';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Sort periods by name naturally (Period 1, Period 2, etc.)
 */
export function sortPeriodsByName(periods: Period[]): Period[] {
  return periods.sort((a, b) => {
    const aName = a.period_name.toLowerCase();
    const bName = b.period_name.toLowerCase();

    // Extract numbers from period names for proper sorting
    const aMatch = aName.match(/(\d+)/);
    const bMatch = bName.match(/(\d+)/);

    if (aMatch && bMatch) {
      const aNumber = parseInt(aMatch[1]);
      const bNumber = parseInt(bMatch[1]);
      return aNumber - bNumber;
    }

    // Fallback to alphabetical sorting if no numbers found
    return aName.localeCompare(bName);
  });
}

/**
 * Generate all dates in a range (inclusive)
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Validate date range for overlaps with existing dates
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  existingDates: string[]
): {
  valid: boolean;
  overlappingDates?: string[];
  message?: string;
} {
  // Generate all dates in the new range
  const newRangeDates = generateDateRange(startDate, endDate);

  // Extract existing dates from ranges
  const allExistingDates: string[] = [];

  existingDates.forEach((item) => {
    if (item.startsWith('RANGE:')) {
      const parts = item.split(':');
      if (parts.length === 3) {
        const rangeStart = parts[1];
        const rangeEnd = parts[2];
        const rangeDates = generateDateRange(rangeStart, rangeEnd);
        allExistingDates.push(...rangeDates);
      }
    } else if (!item.includes('RANGE')) {
      allExistingDates.push(item);
    }
  });

  // Check for overlaps
  const overlappingDates = newRangeDates.filter((date) =>
    allExistingDates.includes(date)
  );

  if (overlappingDates.length > 0) {
    return {
      valid: false,
      overlappingDates,
      message: `The selected range overlaps with existing dates: ${overlappingDates
        .slice(0, 3)
        .join(', ')}${
        overlappingDates.length > 3 ? ` and ${overlappingDates.length - 3} more` : ''
      }`
    };
  }

  return { valid: true };
}

/**
 * Check if any dates in a range already have slots
 */
export function checkDatesWithSlots(
  startDate: string,
  endDate: string,
  slots: any[]
): {
  hasSlots: boolean;
  datesWithSlots?: string[];
  message?: string;
} {
  const newRangeDates = generateDateRange(startDate, endDate);
  const datesWithSlots = newRangeDates.filter((date) =>
    slots.some((slot) => slot.slot_date === date)
  );

  if (datesWithSlots.length > 0) {
    return {
      hasSlots: true,
      datesWithSlots,
      message: `Some dates in this range already have slots created: ${datesWithSlots
        .slice(0, 3)
        .join(', ')}${
        datesWithSlots.length > 3 ? ` and ${datesWithSlots.length - 3} more` : ''
      }`
    };
  }

  return { hasSlots: false };
}

/**
 * Calculate number of days between two dates (inclusive)
 */
export function calculateDaysInRange(startDate: string, endDate: string): number {
  return (
    Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)
    ) + 1
  );
}

/**
 * Export timetable to PDF
 */
export async function exportTimetableToPDF(
  timetable: any,
  timetableFormat: 'regular' | 'batch',
  timetableGridRef: React.RefObject<HTMLDivElement>
): Promise<void> {
  if (!timetableGridRef.current) {
    throw new Error('Timetable grid not found');
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Add title
  pdf.setFontSize(16);
  pdf.text(`Timetable - ${timetable.timetable_name}`, 14, 15);

  pdf.setFontSize(10);
  pdf.text(
    `Generated on: ${format(new Date(), 'PPP')}`,
    14,
    22
  );

  // Add timetable details
  pdf.setFontSize(12);
  pdf.text('Timetable Details:', 14, 30);

  const details = [
    ['Institution', timetable.institution?.institution_name || 'N/A'],
    ['Program', timetable.program?.program_name || 'N/A'],
    ['Semester', timetable.semester_name || 'N/A'],
    ['Section', timetable.section?.section_name || 'All Sections'],
    ['Academic Year', timetable.academic_year || 'N/A'],
    ['Format', timetableFormat === 'batch' ? 'Batch Timetable' : 'Regular Timetable']
  ];

  autoTable(pdf, {
    startY: 35,
    head: [],
    body: details,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 100 }
    }
  });

  // Capture timetable grid and add to PDF
  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(timetableGridRef.current, {
      scale: 2,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 270; // A4 landscape width minus margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add new page for timetable grid
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 14, 14, imgWidth, imgHeight);
  } catch (error) {
    logger.error('academic/timetables', 'Error capturing timetable grid', error);
    throw new Error('Failed to capture timetable grid');
  }

  // Save PDF
  const fileName = `timetable-${timetable.timetable_name}-${format(
    new Date(),
    'yyyy-MM-dd'
  )}.pdf`;
  pdf.save(fileName);
}

/**
 * Format date range marker for storage
 */
export function createRangeMarker(startDate: string, endDate: string): string {
  return `RANGE:${startDate}:${endDate}`;
}

/**
 * Parse range marker to get start and end dates
 */
export function parseRangeMarker(
  marker: string
): { start: string; end: string } | null {
  if (!marker.startsWith('RANGE:')) return null;

  const parts = marker.split(':');
  if (parts.length !== 3) return null;

  return {
    start: parts[1],
    end: parts[2]
  };
}

/**
 * Check if a period is locked (has attendance marked)
 */
export function isPeriodLocked(periodId: string, markedPeriods: string[]): boolean {
  return markedPeriods.includes(periodId);
}
