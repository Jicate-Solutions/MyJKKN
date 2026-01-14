'use client';

/**
 * Export Actions Component
 * Created: 2026-01-14
 * Description: PDF/Image export functionality
 */

import { useState } from 'react';
import { StudentTimetableData } from '@/types/student-portal';
import { DayOfWeek } from '@/types/academics';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Download, FileDown, Share2, Printer, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExportActionsProps {
  timetableData: StudentTimetableData;
  currentDay: DayOfWeek;
}

export function ExportActions({ timetableData, currentDay }: ExportActionsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      // Dynamic import to reduce bundle size
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

      // Add title page
      pdf.setFontSize(20);
      pdf.text('My Timetable', 105, 30, { align: 'center' });
      pdf.setFontSize(12);
      pdf.text(timetableData.student_info.name, 105, 45, { align: 'center' });
      pdf.text(
        `${timetableData.student_info.section_name} • ${timetableData.student_info.semester_name}`,
        105,
        55,
        { align: 'center' }
      );

      // For each day, add a simple text-based schedule
      let yPos = 80;
      days.forEach((day, dayIndex) => {
        const daySlots = timetableData.slots.filter(s => s.day === day);

        if (dayIndex > 0 && yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }

        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text(day, 20, yPos);
        yPos += 10;

        if (daySlots.length === 0) {
          pdf.setFont(undefined, 'normal');
          pdf.setFontSize(10);
          pdf.text('No classes scheduled', 25, yPos);
          yPos += 15;
        } else {
          daySlots.forEach(slot => {
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(10);

            const timeText = `${slot.period.start_time.substring(0, 5)} - ${slot.period.end_time.substring(0, 5)}`;
            const courseText = `${slot.course.course_code} - ${slot.course.course_name}`;
            const facultyText = slot.staff_members.map(s => s.staff_name).join(', ');

            pdf.text(timeText, 25, yPos);
            pdf.text(courseText, 60, yPos);
            if (facultyText) {
              pdf.text(facultyText, 25, yPos + 5);
            }

            yPos += facultyText ? 15 : 10;

            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
          });
        }

        yPos += 5;
      });

      pdf.save(`timetable-${timetableData.student_info.name.replace(/\s+/g, '-')}.pdf`);

      toast({
        title: 'Success',
        description: 'Timetable downloaded as PDF'
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF',
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleDownloadPDF}>
          <FileDown className="w-4 h-4 mr-2" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" />
          Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
