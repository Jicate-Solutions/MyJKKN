'use client';

import { useState, useEffect, useRef } from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  Unlock,
  ListFilter,
  FileDown,
  Printer
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Loading from '@/components/Loading/Loading';
import { useToast } from '@/hooks/use-toast';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { PeriodService } from '@/lib/services/academic/period-service';
import { useStaff } from '@/hooks/staff/use-staff';
import { useCourses } from '@/hooks/organization/use-courses';
import {
  Timetable,
  TimetableSlot,
  DayOfWeek,
  Period,
  CreateTimetableSlotDto
} from '@/types/academics';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

// Days of week in order
const DAYS_OF_WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
];

// Create a sortable period item component
interface SortablePeriodItemProps {
  period: Period;
  index: number;
  onRemove: (id: string) => void;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
}

function SortablePeriodItem({
  period,
  index,
  onRemove,
  isLocked,
  onToggleLock
}: SortablePeriodItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: period.id,
    disabled: isLocked
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
    boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.1)' : 'none'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 border p-2 rounded-md ${
        isLocked
          ? 'bg-slate-50 border-slate-200'
          : isDragging
          ? 'bg-blue-50 border-blue-200 shadow-lg'
          : 'bg-white hover:bg-slate-50 border-slate-200'
      } transition-colors mb-1.5`}
    >
      <div
        className={`${
          isLocked
            ? 'text-slate-300 cursor-not-allowed'
            : 'cursor-move text-blue-600 hover:text-blue-700'
        } p-1 rounded-md ${!isLocked && 'hover:bg-blue-50'} transition-colors`}
        {...(!isLocked ? attributes : {})}
        {...(!isLocked ? listeners : {})}
        title={isLocked ? 'Locked - cannot move' : 'Drag to reorder'}
      >
        <GripVertical className='h-3.5 w-3.5' />
      </div>
      <div className='flex-1'>
        <div className='flex items-center gap-1 mb-0.5'>
          <span className='font-semibold text-xs text-slate-800'>
            {period.period_name}
          </span>
          {period.is_break && (
            <Badge
              variant='outline'
              className='h-3.5 px-1 py-0 text-[9px] bg-amber-50 text-amber-600 border-amber-200'
            >
              Break
            </Badge>
          )}
        </div>
        <p className='text-[10px] text-slate-500'>
          {new Date(`2000-01-01T${period.start_time}`).toLocaleTimeString(
            'en-US',
            {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }
          )}{' '}
          -{' '}
          {new Date(`2000-01-01T${period.end_time}`).toLocaleTimeString(
            'en-US',
            {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }
          )}
        </p>
      </div>
      <div className='flex items-center gap-1'>
        <Button
          variant='ghost'
          size='sm'
          className={`h-6 w-6 p-0 rounded-full ${
            isLocked
              ? 'bg-blue-50 text-blue-600'
              : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
          }`}
          onClick={() => onToggleLock(period.id)}
          title={isLocked ? 'Unlock position' : 'Lock position'}
        >
          {isLocked ? (
            <Lock className='h-3 w-3' />
          ) : (
            <Unlock className='h-3 w-3' />
          )}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          className='h-6 w-6 p-0 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50'
          onClick={() => onRemove(period.id)}
          title='Remove period'
        >
          <Trash2 className='h-3 w-3' />
        </Button>
      </div>
    </div>
  );
}

export default function TimetableDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const unwrappedParams = use(params);
  const timetableId = unwrappedParams.id;
  const { saveTimetableAsTemplate } = useTimetables();

  // Add ref for timetable grid capture
  const timetableGridRef = useRef<HTMLDivElement>(null);
  const timetableInfoRef = useRef<HTMLDivElement>(null);

  // States
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [isBreakSlot, setIsBreakSlot] = useState(false);
  const [breakDescription, setBreakDescription] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [savingSlot, setSavingSlot] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>([]);

  // Fetch courses and staff data
  const {
    courses,
    loading: loadingCourses,
    fetchCourses
  } = useCourses({
    institution_id: timetable?.institution_id,
    isActive: true
  });

  const {
    staff,
    loading: loadingStaff,
    fetchStaff
  } = useStaff({
    isActive: true
  });

  // Load selected periods from local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      const storedPeriods = localStorage.getItem(
        `selectedPeriods-${timetableId}`
      );
      if (storedPeriods) {
        try {
          const periodIds = JSON.parse(storedPeriods);
          // We'll apply these IDs after periods are loaded
          if (periods.length > 0) {
            // Fix: Instead of just filtering, we need to maintain the order from localStorage
            const orderedPeriods = periodIds
              .map((id: string) => periods.find((period) => period.id === id))
              .filter(Boolean); // Filter out any undefined values

            if (orderedPeriods.length > 0) {
              setSelectedPeriods(orderedPeriods);
            }
          }
        } catch (err) {
          console.error('Error parsing stored periods:', err);
        }
      }

      // Load locked periods from localStorage
      const storedLockedPeriods = localStorage.getItem(
        `lockedPeriods-${timetableId}`
      );
      if (storedLockedPeriods) {
        try {
          const lockedIds = JSON.parse(storedLockedPeriods);
          setLockedPeriods(lockedIds);
        } catch (err) {
          console.error('Error parsing locked periods:', err);
        }
      }
    }
  }, [periods, timetableId]);

  // Save selected periods to local storage
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      timetableId &&
      selectedPeriods.length > 0
    ) {
      const periodIds = selectedPeriods.map((period) => period.id);
      localStorage.setItem(
        `selectedPeriods-${timetableId}`,
        JSON.stringify(periodIds)
      );
    }
  }, [selectedPeriods, timetableId]);

  // Save locked periods to local storage
  useEffect(() => {
    if (typeof window !== 'undefined' && timetableId) {
      if (lockedPeriods.length > 0) {
        localStorage.setItem(
          `lockedPeriods-${timetableId}`,
          JSON.stringify(lockedPeriods)
        );
      } else {
        localStorage.removeItem(`lockedPeriods-${timetableId}`);
      }
    }
  }, [lockedPeriods, timetableId]);

  // Fetch timetable data
  const fetchTimetableData = async () => {
    try {
      setLoading(true);
      setError(null);
      const timetableData = await TimetableService.getTimetable(timetableId);
      setTimetable(timetableData);

      // Fetch periods
      const periodsResult = await PeriodService.getPeriods({ limit: 50 });
      setPeriods(periodsResult.data);

      // Initialize selected periods if empty - we only do this if no localStorage value exists
      if (
        selectedPeriods.length === 0 &&
        typeof window !== 'undefined' &&
        !localStorage.getItem(`selectedPeriods-${timetableId}`)
      ) {
        setSelectedPeriods(periodsResult.data);
      }

      // Load related courses - fetch from course mappings for this program and semester
      if (timetableData.institution_id) {
        fetchCourses({
          institution_id: timetableData.institution_id,
          isActive: true
        });
      }

      // Load staff
      fetchStaff();
    } catch (err) {
      console.error('Error fetching timetable data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetableData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableId]);

  // Save as template handler
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a template name',
        variant: 'destructive'
      });
      return;
    }

    setSavingTemplate(true);
    try {
      const success = await saveTimetableAsTemplate(timetableId, templateName);
      if (success) {
        toast({
          title: 'Success',
          description: 'Timetable saved as template successfully'
        });
        setTemplateDialogOpen(false);
      } else {
        throw new Error('Failed to save template');
      }
    } catch (err) {
      console.error('Error saving as template:', err);
      toast({
        title: 'Error',
        description: 'Failed to save as template. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  // Open slot dialog to add or edit a slot
  const openSlotDialog = (
    day: DayOfWeek,
    period: Period,
    existingSlot?: TimetableSlot
  ) => {
    setSelectedDay(day);
    setSelectedPeriod(period);

    if (existingSlot) {
      setSelectedSlot(existingSlot);
      setIsBreakSlot(existingSlot.is_break_slot);
      setBreakDescription(existingSlot.break_description || '');
      setSelectedCourseId(existingSlot.course_id || '');
      setSelectedStaffId(existingSlot.staff_id || '');
    } else {
      setSelectedSlot(null);
      setIsBreakSlot(false);
      setBreakDescription('');
      setSelectedCourseId('');
      setSelectedStaffId('');
    }

    setSlotDialogOpen(true);
  };

  // Close slot dialog and reset form
  const closeSlotDialog = () => {
    setSlotDialogOpen(false);
    setSelectedDay(null);
    setSelectedPeriod(null);
    setSelectedSlot(null);
    setIsBreakSlot(false);
    setBreakDescription('');
    setSelectedCourseId('');
    setSelectedStaffId('');
  };

  // Save a timetable slot
  const saveSlot = async () => {
    if (!selectedDay || !selectedPeriod) return;

    setSavingSlot(true);
    try {
      const slotData: CreateTimetableSlotDto = {
        timetable_id: timetableId,
        day_of_week: selectedDay,
        period_id: selectedPeriod.id,
        is_break_slot: isBreakSlot,
        break_description: isBreakSlot ? breakDescription : undefined,
        course_id: !isBreakSlot
          ? selectedCourseId !== 'none'
            ? selectedCourseId
            : undefined
          : undefined,
        staff_id:
          !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
            ? selectedStaffId !== 'none'
              ? selectedStaffId
              : undefined
            : undefined
      };

      let result;
      if (selectedSlot) {
        // Update existing slot
        result = await TimetableService.updateTimetableSlot(selectedSlot.id, {
          is_break_slot: isBreakSlot,
          break_description: isBreakSlot ? breakDescription : undefined,
          course_id: !isBreakSlot
            ? selectedCourseId !== 'none'
              ? selectedCourseId
              : undefined
            : undefined,
          staff_id:
            !isBreakSlot && selectedCourseId && selectedCourseId !== 'none'
              ? selectedStaffId !== 'none'
                ? selectedStaffId
                : undefined
              : undefined
        });
      } else {
        // Create new slot
        result = await TimetableService.createTimetableSlot(slotData);
      }

      // Check for staff conflicts
      if (slotData.staff_id) {
        const hasConflict = await TimetableService.checkStaffConflicts(
          slotData.staff_id,
          slotData.day_of_week,
          slotData.period_id,
          timetableId
        );

        if (hasConflict) {
          toast({
            title: 'Warning',
            description:
              'Staff member is already assigned to another class at this time.',
            variant: 'destructive'
          });
        }
      }

      // Refresh timetable data
      await fetchTimetableData();

      toast({
        title: 'Success',
        description: selectedSlot
          ? 'Slot updated successfully'
          : 'Slot added successfully'
      });

      closeSlotDialog();
    } catch (err) {
      console.error('Error saving slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to save slot. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSavingSlot(false);
    }
  };

  // Delete a timetable slot
  const deleteSlot = async () => {
    if (!slotToDelete) return;

    try {
      await TimetableService.deleteTimetableSlot(slotToDelete.id);

      // Refresh timetable data
      await fetchTimetableData();

      toast({
        title: 'Success',
        description: 'Slot deleted successfully'
      });

      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    } catch (err) {
      console.error('Error deleting slot:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete slot. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Open delete dialog
  const openDeleteDialog = (slot: TimetableSlot) => {
    setSlotToDelete(slot);
    setDeleteDialogOpen(true);
  };

  // Get slot for a day and period
  const getSlot = (day: DayOfWeek, periodId: string) => {
    return timetable?.slots?.find(
      (slot) => slot.day_of_week === day && slot.period_id === periodId
    );
  };

  // Handle period selection
  const handlePeriodSelection = (selectedIds: string[]) => {
    const newSelectedPeriods = periods.filter((period) =>
      selectedIds.includes(period.id)
    );
    setSelectedPeriods(newSelectedPeriods);
    setPeriodSelectorOpen(false);
  };

  // Set up DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Start dragging after moving 8px to prevent accidental drags
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Handle DnD end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSelectedPeriods((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Handle removing a period
  const handleRemovePeriod = (id: string) => {
    setSelectedPeriods(selectedPeriods.filter((p) => p.id !== id));
    // Also remove from locked periods if it was locked
    if (lockedPeriods.includes(id)) {
      setLockedPeriods(lockedPeriods.filter((periodId) => periodId !== id));
    }
  };

  // Toggle lock for a period
  const toggleLockPeriod = (id: string) => {
    if (lockedPeriods.includes(id)) {
      setLockedPeriods(lockedPeriods.filter((periodId) => periodId !== id));
    } else {
      setLockedPeriods([...lockedPeriods, id]);
    }
  };

  // Add PDF export function
  const exportToPDF = async () => {
    if (!timetable || !timetableGridRef.current || !timetableInfoRef.current)
      return;

    try {
      // Show loading toast
      toast({
        title: 'Generating PDF',
        description: 'Please wait while we generate your timetable PDF...'
      });

      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 15;

      // Set document properties
      pdf.setProperties({
        title: `Timetable - ${timetable.timetable_name}`,
        subject: `Timetable for ${timetable.semester} - ${timetable.section}`,
        creator: 'JKKN Timetable System'
      });

      // Add background to header
      pdf.setFillColor(240, 247, 255);
      pdf.rect(0, 0, pageWidth, 40, 'F');

      // Add border to header
      pdf.setDrawColor(200, 215, 240);
      pdf.setLineWidth(0.5);
      pdf.line(0, 40, pageWidth, 40);

      // Add main title with better styling
      pdf.setFontSize(22);
      pdf.setTextColor(0, 51, 102);
      pdf.setFont('helvetica', 'bold');
      pdf.text(timetable.timetable_name, margin, 15);

      // Add horizontal separator under title
      pdf.setDrawColor(65, 105, 225);
      pdf.setLineWidth(0.5);
      pdf.line(margin, 18, pageWidth - margin, 18);

      // Create two columns for institution details with better organization
      const colWidth = (pageWidth - 2 * margin) / 2;
      const leftCol = margin;
      const rightCol = leftCol + colWidth;

      // Add logo
      pdf.setDrawColor(65, 105, 225);
      pdf.setFillColor(65, 105, 225);
      pdf.roundedRect(pageWidth - margin - 30, 5, 25, 15, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('JKKN', pageWidth - margin - 20, 14);

      // --- First row ---
      // Set styles for labels
      pdf.setFontSize(10);
      pdf.setTextColor(65, 105, 225);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Institution', leftCol, 25);
      pdf.text('Program Details', rightCol, 25);

      // Set styles for values
      pdf.setTextColor(60, 60, 60);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`: ${timetable.institution?.name || 'N/A'}`, leftCol + 30, 25);
      pdf.text(
        `: Undergraduate / ${timetable.program?.program_name || 'N/A'}`,
        rightCol + 30,
        25
      );

      // --- Second row ---
      pdf.setTextColor(65, 105, 225);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Academic Year', leftCol, 32);
      pdf.text('Department', rightCol, 32);

      pdf.setTextColor(60, 60, 60);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `: ${timetable.academic_year?.academic_year_name || 'N/A'}`,
        leftCol + 30,
        32
      );
      pdf.text(
        `: ${timetable.department?.department_name || 'N/A'}`,
        rightCol + 30,
        32
      );

      // --- Third row ---
      pdf.setTextColor(65, 105, 225);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Class Information', leftCol, 39);
      pdf.text('Generated', rightCol, 39);

      pdf.setTextColor(60, 60, 60);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `: Semester ${timetable.semester} | Section ${timetable.section}`,
        leftCol + 30,
        39
      );
      pdf.text(
        `: ${new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`,
        rightCol + 30,
        39
      );

      // Start Y position for the timetable (after header)
      const tableStartY = 45;

      // Capture and add timetable grid
      if (selectedPeriods.length > 0) {
        // Create timetable as table data for jsPDF-autotable
        const tableData = DAYS_OF_WEEK.map((day) => {
          // First column is the day name
          const rowData = [day.charAt(0) + day.slice(1).toLowerCase()];

          // For each period, add a cell with course/staff info
          selectedPeriods.forEach((period) => {
            const slot = getSlot(day, period.id);
            let cellContent = '';

            if (slot) {
              if (slot.is_break_slot) {
                cellContent = `BREAK:\n${
                  slot.break_description || 'Break Time'
                }`;
              } else if (slot.course) {
                // Format course and staff info more clearly
                cellContent = `${slot.course.course_name}`;

                // Add staff info with better formatting
                if (slot.staff) {
                  cellContent += `\n\nStaff: ${slot.staff.first_name} ${slot.staff.last_name}`;
                }
              }
            }
            rowData.push(cellContent);
          });

          return rowData;
        });

        // Create the header row with period names and times
        const tableHeader = ['Day / Period'];
        selectedPeriods.forEach((period) => {
          const startTime = new Date(
            `2000-01-01T${period.start_time}`
          ).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          const endTime = new Date(
            `2000-01-01T${period.end_time}`
          ).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          tableHeader.push(`${period.period_name}\n${startTime} - ${endTime}`);
        });

        // Calculate optimal column widths
        const firstColWidth = 25; // Width for day column
        const availableWidth = pageWidth - 2 * margin - firstColWidth;
        const periodColWidth = availableWidth / selectedPeriods.length;

        // Create column styles with dynamic widths
        const columnStyles: any = {
          0: {
            fillColor: [65, 105, 225],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            cellWidth: firstColWidth
          }
        };

        // Set same width for all period columns
        for (let i = 1; i <= selectedPeriods.length; i++) {
          columnStyles[i] = {
            cellWidth: periodColWidth
          };
        }

        // Add the timetable using autoTable - with improved styling
        autoTable(pdf, {
          head: [tableHeader],
          body: tableData,
          startY: tableStartY,
          theme: 'grid',
          tableWidth: pageWidth - 2 * margin,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 9,
            cellPadding: { top: 5, right: 3, bottom: 5, left: 3 },
            lineColor: [200, 200, 200],
            lineWidth: 0.2,
            valign: 'middle',
            overflow: 'linebreak',
            minCellHeight: 15
          },
          headStyles: {
            fillColor: [65, 105, 225],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 9,
            cellPadding: { top: 4, right: 2, bottom: 4, left: 2 }
          },
          columnStyles: columnStyles,
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          didDrawCell: (data: any) => {
            // Add styling for break cells with better visual distinction
            if (
              data.cell.text &&
              data.cell.text[0] &&
              data.cell.text[0].includes('BREAK:')
            ) {
              data.cell.styles.fillColor = [255, 245, 230];
              data.cell.styles.textColor = [180, 95, 6];
              data.cell.styles.fontStyle = 'bold';
            }

            // Add styling for staff information
            if (data.cell.text && data.cell.text.length > 1) {
              const text = data.cell.text;
              const staffLine = text.find((line: string) =>
                line.includes('Staff:')
              );
              if (staffLine && !text[0].includes('BREAK:')) {
                data.cell.styles.lineWidth = 0.3;
                data.cell.styles.lineColor = [100, 150, 230];
              }
            }
          }
        });
      } else {
        // If no periods are selected
        pdf.setFontSize(12);
        pdf.setTextColor(100);
        pdf.text(
          'No periods have been selected for this timetable.',
          margin,
          60
        );
      }

      // Add footer
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.setFont('helvetica', 'italic');
      pdf.text(
        `Generated from JKKN Timetable Management System`,
        margin,
        pageHeight - 10
      );

      // Add page number
      pdf.text(`Page 1 of 1`, pageWidth - margin - 20, pageHeight - 10);

      // Save the PDF
      pdf.save(
        `Timetable_${timetable.timetable_name.replace(/\s+/g, '_')}.pdf`
      );

      // Success toast
      toast({
        title: 'PDF Generated',
        description: 'Your timetable has been exported to PDF successfully.'
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return <Loading title='Loading timetable...' />;
  }

  if (error || !timetable) {
    return (
      <ContentLayout title='Timetable Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Timetable not found'}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/academic/timetables')}
            className='mt-4'
          >
            Back to Timetables
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Timetable Details'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/timetables'>Timetables</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{timetable.timetable_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-8'>
        <div className='flex flex-col gap-4 sm:gap-6'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between'>
            <div className='mb-4 sm:mb-0'>
              <h1 className='text-2xl sm:text-3xl font-bold tracking-tight mb-1'>
                {timetable.timetable_name}
              </h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Manage and view the timetable details
              </p>
            </div>
            <div className='flex flex-wrap gap-2 self-start'>
              <Button variant='outline' asChild className='h-9'>
                <Link href='/academic/timetables'>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Back
                </Link>
              </Button>
              <Button variant='outline' asChild className='h-9'>
                <Link href={`/academic/timetables/${timetable.id}/edit`}>
                  <Edit className='mr-2 h-4 w-4' />
                  Edit
                </Link>
              </Button>
              <Button
                variant='outline'
                onClick={exportToPDF}
                className='h-9 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
              >
                <FileDown className='mr-2 h-4 w-4' />
                Export PDF
              </Button>
              <Button
                variant='default'
                onClick={() => setTemplateDialogOpen(true)}
                className='h-9'
              >
                <Save className='mr-2 h-4 w-4' />
                Save as Template
              </Button>
            </div>
          </div>
        </div>

        <Card
          className='mb-6 border-0 shadow-sm overflow-hidden'
          ref={timetableInfoRef}
        >
          <CardContent className='p-0'>
            <div className='flex items-center justify-between border-b p-3 bg-slate-50'>
              <div className='flex flex-wrap gap-2 items-center'>
                {timetable.is_template && (
                  <Badge variant='secondary' className='h-5 px-1.5 text-[10px]'>
                    Template
                  </Badge>
                )}
                {timetable.is_active ? (
                  <Badge
                    variant='outline'
                    className='bg-emerald-50 text-emerald-700 border-emerald-200 h-5 px-1.5 text-[10px]'
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant='outline'
                    className='bg-gray-50 text-gray-700 border-gray-200 h-5 px-1.5 text-[10px]'
                  >
                    Inactive
                  </Badge>
                )}
                <span className='text-xs text-muted-foreground ml-1'>
                  Version {timetable.version}
                </span>
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x'>
              <div className='p-3 sm:p-4'>
                <h3 className='text-xs font-medium text-slate-500 mb-3'>
                  Institution & Academic Details
                </h3>
                <dl className='space-y-2.5'>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Institution
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {timetable.institution?.name || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Academic Year
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {timetable.academic_year?.academic_year_name || 'N/A'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className='p-3 sm:p-4'>
                <h3 className='text-xs font-medium text-slate-500 mb-3'>
                  Program Information
                </h3>
                <dl className='space-y-2.5'>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Degree
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {timetable.degree?.degree_name || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Program
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {timetable.program?.program_name || 'N/A'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Department
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {timetable.department?.department_name || 'N/A'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className='p-3 sm:p-4'>
                <h3 className='text-xs font-medium text-slate-500 mb-3'>
                  Class Details & Dates
                </h3>
                <dl className='space-y-2.5'>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Semester / Section
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      Semester {timetable.semester} / Section{' '}
                      {timetable.section}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Created
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {new Date(timetable.created_at).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs font-medium text-slate-500'>
                      Last Updated
                    </dt>
                    <dd className='mt-0.5 text-sm'>
                      {new Date(timetable.updated_at).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='border-0 shadow-sm overflow-hidden'>
          <CardContent className='p-0'>
            <div className='p-3 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <h2 className='text-base font-semibold text-slate-800'>
                  Timetable
                </h2>
                <p className='text-xs text-slate-500'>
                  Schedule for Semester {timetable.semester} / Section{' '}
                  {timetable.section}
                </p>
              </div>
              <div className='mt-2 sm:mt-0 flex items-center gap-2'>
                <Button
                  variant='outline'
                  onClick={() => setPeriodSelectorOpen(true)}
                  className='h-8 text-xs sm:h-8 sm:text-xs flex items-center gap-1.5 bg-gradient-to-r from-slate-50 to-blue-50 border-blue-100 hover:from-slate-100 hover:to-blue-100 hover:border-blue-200 transition-all'
                >
                  <ListFilter className='w-3.5 h-3.5 text-blue-600' />
                  <span className='hidden sm:inline text-slate-700'>
                    Configure Periods
                  </span>
                  <span className='sm:hidden text-slate-700'>Periods</span>
                  <Badge
                    variant='secondary'
                    className='ml-1 bg-blue-100 text-blue-700 h-5 px-1 text-[10px]'
                  >
                    {selectedPeriods.length}
                  </Badge>
                </Button>
                <Button
                  variant='outline'
                  onClick={exportToPDF}
                  className='h-8 text-xs flex items-center gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                >
                  <FileDown className='h-3.5 w-3.5' />
                  <span className='hidden sm:inline'>Export PDF</span>
                  <span className='sm:hidden'>PDF</span>
                </Button>
              </div>
            </div>
            <div
              className='p-3 sm:p-4 overflow-x-auto bg-gradient-to-br from-white to-slate-50'
              ref={timetableGridRef}
            >
              {/* Timetable Grid */}
              <div className='min-w-[600px] lg:min-w-0 lg:w-full'>
                {selectedPeriods.length === 0 ? (
                  <div className='flex flex-col items-center justify-center py-8 px-4 text-center'>
                    <div className='mb-3 rounded-full bg-blue-50 p-2.5'>
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width='24'
                        height='24'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        className='h-5 w-5 text-blue-600'
                      >
                        <rect
                          width='18'
                          height='18'
                          x='3'
                          y='3'
                          rx='2'
                          ry='2'
                        ></rect>
                        <line x1='3' y1='9' x2='21' y2='9'></line>
                        <line x1='9' y1='21' x2='9' y2='9'></line>
                      </svg>
                    </div>
                    <h3 className='text-base font-semibold text-blue-700'>
                      No periods selected
                    </h3>
                    <p className='mt-1 text-xs text-slate-500 max-w-md'>
                      Please click the &quot;Configure Periods&quot; button to
                      select which periods you want to display in the timetable.
                    </p>
                    <Button
                      variant='default'
                      onClick={() => setPeriodSelectorOpen(true)}
                      className='mt-3 h-8 text-xs bg-blue-600 hover:bg-blue-700'
                    >
                      Configure Periods
                    </Button>
                  </div>
                ) : (
                  <table className='w-full border-collapse rounded-md overflow-hidden shadow-sm'>
                    <thead>
                      <tr>
                        <th className='border border-slate-200 p-1.5 sm:p-2 bg-blue-600 font-semibold text-left text-sm text-white w-24'>
                          Day / Period
                        </th>
                        {selectedPeriods.map((period) => (
                          <th
                            key={period.id}
                            className='border border-slate-200 p-1.5 sm:p-2 bg-secondary font-medium text-center text-slate-700'
                          >
                            <div className='text-xs font-semibold'>
                              {period.period_name}
                            </div>
                            <div className='text-[10px] text-black mt-0.5 hidden sm:block'>
                              {new Date(
                                `2000-01-01T${period.start_time}`
                              ).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}{' '}
                              -{' '}
                              {new Date(
                                `2000-01-01T${period.end_time}`
                              ).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS_OF_WEEK.map((day) => (
                        <tr key={day}>
                          <td className='border border-slate-200 p-1.5 sm:p-2 font-medium bg-primary text-sm text-white'>
                            {day.charAt(0) + day.slice(1).toLowerCase()}
                          </td>
                          {selectedPeriods.map((period) => {
                            const slot = getSlot(day, period.id);
                            return (
                              <td
                                key={period.id}
                                className={`border border-slate-200 p-0 text-center h-[80px] sm:h-[100px] ${
                                  slot?.is_break_slot
                                    ? 'bg-gradient-to-br from-amber-50 to-orange-50'
                                    : slot?.course_id
                                    ? 'bg-gradient-to-br from-slate-50 to-blue-50'
                                    : 'bg-white'
                                } hover:bg-opacity-95 cursor-pointer transition-all`}
                                onClick={() =>
                                  openSlotDialog(day, period, slot)
                                }
                              >
                                {slot ? (
                                  <div className='flex flex-col items-center justify-center h-full relative p-1.5 sm:p-2'>
                                    {slot.is_break_slot ? (
                                      <div className='font-medium text-amber-700 flex flex-col items-center'>
                                        <span className='text-amber-600 mb-1 text-[9px] sm:text-[10px] rounded-full bg-amber-100 px-1.5 py-0.5'>
                                          Break
                                        </span>
                                        <span className='text-xs'>
                                          {slot.break_description ||
                                            'Break Time'}
                                        </span>
                                      </div>
                                    ) : (
                                      <>
                                        {slot.course ? (
                                          <div className='font-semibold text-slate-700 mb-1 text-[9px] sm:text-[12px] rounded-full px-1.5 py-0.5'>
                                            {slot.course.course_name}
                                          </div>
                                        ) : null}
                                        {slot.staff ? (
                                          <div className='text-[9px] sm:text-[10px] text-slate-600 flex items-center bg-white/70 rounded-md px-1.5 py-0.5 shadow-sm'>
                                            <span className='inline-block w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-blue-400 mr-1'></span>
                                            <span className='truncate max-w-[80px] sm:max-w-none'>
                                              {slot.staff.first_name}{' '}
                                              {slot.staff.last_name}
                                            </span>
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                    {slot && (
                                      <button
                                        className='absolute top-0.5 right-0.5 text-red-400 opacity-0 hover:opacity-100 hover:text-red-600 transition-opacity'
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openDeleteDialog(slot);
                                        }}
                                      >
                                        <Trash2 className='h-2.5 w-2.5 sm:h-3 sm:w-3' />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className='flex items-center justify-center h-full'>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <div className='w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center group hover:bg-blue-100 hover:border-blue-200 transition-all shadow-sm'>
                                            <Plus className='h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-500 group-hover:text-blue-600 transition-colors' />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className='text-xs'>
                                            Click to add a class or break
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Templates allow you to reuse the same timetable structure for
              other sections or future academic years.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='template-name'>Template Name</Label>
              <Input
                id='template-name'
                placeholder='e.g., CSE Semester 3 Template'
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className='w-full'
              />
              <p className='text-xs text-muted-foreground'>
                Give your template a descriptive name that will help you
                identify it later.
              </p>
            </div>
          </div>
          <DialogFooter className='sm:justify-end'>
            <Button
              variant='outline'
              onClick={() => setTemplateDialogOpen(false)}
              disabled={savingTemplate}
              className='h-9'
            >
              Cancel
            </Button>
            <Button
              variant='default'
              onClick={handleSaveAsTemplate}
              disabled={savingTemplate || !templateName.trim()}
              className='h-9'
            >
              {savingTemplate ? (
                <>
                  <span className='mr-2'>Saving</span>
                  <span className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                </>
              ) : (
                'Save Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slot Dialog */}
      <Dialog
        open={slotDialogOpen}
        onOpenChange={(open) => !savingSlot && setSlotDialogOpen(open)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{selectedSlot ? 'Edit Slot' : 'Add Slot'}</DialogTitle>
            <DialogDescription>
              {selectedDay && selectedPeriod && (
                <span className='mt-1 block'>
                  <span className='font-medium'>
                    {selectedDay.charAt(0) + selectedDay.slice(1).toLowerCase()}{' '}
                  </span>
                  <span className='text-muted-foreground'>
                    {selectedPeriod.period_name} (
                    {new Date(
                      `2000-01-01T${selectedPeriod.start_time}`
                    ).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}{' '}
                    -{' '}
                    {new Date(
                      `2000-01-01T${selectedPeriod.end_time}`
                    ).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                    )
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-5 py-4'>
            <div className='flex items-center space-x-3 border p-3 rounded-md bg-muted/20'>
              <Checkbox
                id='is-break'
                checked={isBreakSlot}
                onCheckedChange={(checked) => {
                  setIsBreakSlot(!!checked);
                  if (checked) {
                    setSelectedCourseId('');
                    setSelectedStaffId('');
                  } else {
                    setBreakDescription('');
                  }
                }}
              />
              <Label htmlFor='is-break' className='font-medium'>
                This is a break slot
              </Label>
            </div>

            {isBreakSlot ? (
              <div className='space-y-2'>
                <Label htmlFor='break-description'>Break Description</Label>
                <Input
                  id='break-description'
                  placeholder='e.g., Lunch Break, Tea Break'
                  value={breakDescription}
                  onChange={(e) => setBreakDescription(e.target.value)}
                  className='w-full'
                />
                <p className='text-xs text-muted-foreground'>
                  Provide a short description of the break that will be
                  displayed on the timetable.
                </p>
              </div>
            ) : (
              <>
                <div className='space-y-2'>
                  <Label htmlFor='course'>Course</Label>
                  <Select
                    value={selectedCourseId}
                    onValueChange={setSelectedCourseId}
                    disabled={loadingCourses}
                  >
                    <SelectTrigger id='course' className='w-full'>
                      <SelectValue placeholder='Select a course' />
                    </SelectTrigger>
                    <SelectContent className='max-h-60 overflow-y-auto'>
                      <SelectItem value='none'>None</SelectItem>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.course_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCourseId && selectedCourseId !== 'none' && (
                  <div className='space-y-2'>
                    <Label htmlFor='staff'>Staff</Label>
                    <Select
                      value={selectedStaffId}
                      onValueChange={setSelectedStaffId}
                      disabled={loadingStaff}
                    >
                      <SelectTrigger id='staff' className='w-full'>
                        <SelectValue placeholder='Select staff member' />
                      </SelectTrigger>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        <SelectItem value='none'>None</SelectItem>
                        {staff.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.first_name} {member.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className='sm:justify-end'>
            <Button
              variant='outline'
              onClick={closeSlotDialog}
              disabled={savingSlot}
              className='h-9'
            >
              Cancel
            </Button>
            <Button
              variant='default'
              onClick={saveSlot}
              disabled={
                savingSlot ||
                (isBreakSlot && !breakDescription) ||
                (!isBreakSlot &&
                  (!selectedCourseId || selectedCourseId === 'none'))
              }
              className='h-9'
            >
              {savingSlot ? (
                <>
                  <span className='mr-2'>Saving</span>
                  <span className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
                </>
              ) : selectedSlot ? (
                'Update'
              ) : (
                'Add'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Slot Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className='sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this slot from the timetable. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='sm:justify-end'>
            <AlertDialogCancel className='h-9'>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSlot}
              className='h-9 bg-red-600 hover:bg-red-700 text-white'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Period Selector Dialog */}
      <Dialog open={periodSelectorOpen} onOpenChange={setPeriodSelectorOpen}>
        <DialogContent className='sm:max-w-[500px] border-0 shadow-lg'>
          <DialogHeader className='bg-gradient-to-r from-slate-50 to-blue-50 p-4 rounded-t-lg border-b border-slate-200'>
            <DialogTitle className='text-slate-800 text-lg'>
              Configure Timetable Periods
            </DialogTitle>
            <DialogDescription>
              <span className='text-slate-600'>
                Select periods to display in your timetable, then drag to
                arrange them or lock their positions.
              </span>
            </DialogDescription>
            <div className='mt-2 text-xs bg-white/60 px-2.5 py-1 rounded-md border border-slate-200 inline-flex gap-1.5 items-center'>
              <Badge
                variant='outline'
                className='bg-blue-600 text-white border-0 h-4'
              >
                {selectedPeriods.length}
              </Badge>
              <span className='text-slate-600'>
                of {periods.length} periods selected
              </span>
            </div>
          </DialogHeader>

          <div className='space-y-4 py-4 px-4 max-h-[60vh] overflow-y-auto bg-gradient-to-br from-white to-slate-50'>
            <div className='flex items-center justify-between mb-1'>
              <h3 className='text-xs font-medium flex items-center gap-1.5 text-slate-700'>
                <span className='bg-blue-100 h-4 w-4 rounded-full flex items-center justify-center text-[10px] text-blue-700 font-bold'>
                  1
                </span>
                Selected Periods
                <span className='text-[10px] font-normal text-slate-500'>
                  (Drag to reorder)
                </span>
              </h3>
              <div className='flex items-center gap-2'>
                {lockedPeriods.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant='outline'
                          className='bg-blue-50 border-blue-200 text-blue-700 h-4 px-1 text-[10px] flex items-center gap-0.5 cursor-help'
                        >
                          <Lock className='h-2.5 w-2.5' />
                          {lockedPeriods.length}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side='bottom'>
                        <p className='text-[10px] max-w-[200px]'>
                          Locked periods maintain their position and can&apos;t
                          be reordered. This helps you create a consistent
                          layout.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            {/* Selected Periods Section with drag handles */}
            <div className='space-y-1 mb-3 bg-white p-1.5 rounded-md border border-slate-200 shadow-sm'>
              {selectedPeriods.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedPeriods.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {selectedPeriods.map((period, index) => (
                      <SortablePeriodItem
                        key={period.id}
                        period={period}
                        index={index}
                        onRemove={handleRemovePeriod}
                        isLocked={lockedPeriods.includes(period.id)}
                        onToggleLock={toggleLockPeriod}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                <div className='flex flex-col items-center justify-center p-4 border border-dashed rounded-md bg-blue-50/50 text-center'>
                  <p className='text-xs text-blue-600 mb-1'>
                    No periods selected
                  </p>
                  <p className='text-[10px] text-slate-500'>
                    Select periods from the list below
                  </p>
                </div>
              )}
            </div>

            <div className='flex items-center justify-between mt-4 mb-1'>
              <h3 className='text-xs font-medium flex items-center gap-1.5 text-slate-700'>
                <span className='bg-blue-100 h-4 w-4 rounded-full flex items-center justify-center text-[10px] text-blue-700 font-bold'>
                  2
                </span>
                Available Periods
              </h3>
              <div className='flex gap-1.5'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setSelectedPeriods(
                      periods.sort(
                        (a, b) =>
                          new Date(`2000-01-01T${a.start_time}`).getTime() -
                          new Date(`2000-01-01T${b.start_time}`).getTime()
                      )
                    );
                  }}
                  className='h-6 text-[10px] text-blue-600 border-blue-200 hover:bg-blue-50'
                >
                  Select All
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setSelectedPeriods([]);
                    setLockedPeriods([]);
                  }}
                  className='h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50'
                >
                  Clear All
                </Button>
              </div>
            </div>

            {/* Available Periods Section */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1.5 rounded-md border border-slate-200 bg-white shadow-sm'>
              {periods
                .filter(
                  (period) => !selectedPeriods.some((p) => p.id === period.id)
                )
                .map((period) => (
                  <div
                    key={period.id}
                    className='flex items-center gap-2 border p-2 rounded-md bg-slate-50 hover:bg-blue-50/50 transition-colors'
                  >
                    <div className='flex-1'>
                      <p className='font-medium text-xs text-slate-700'>
                        {period.period_name}
                      </p>
                      <p className='text-[10px] text-slate-500'>
                        {new Date(
                          `2000-01-01T${period.start_time}`
                        ).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}{' '}
                        -{' '}
                        {new Date(
                          `2000-01-01T${period.end_time}`
                        ).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                        {period.is_break && ' (Break)'}
                      </p>
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-6 min-w-[50px] text-[10px] gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
                      onClick={() => {
                        setSelectedPeriods((prev) =>
                          [...prev, period].sort(
                            (a, b) =>
                              new Date(`2000-01-01T${a.start_time}`).getTime() -
                              new Date(`2000-01-01T${b.start_time}`).getTime()
                          )
                        );
                      }}
                      title='Add period to timetable'
                    >
                      <Plus className='h-3 w-3' />
                      Add
                    </Button>
                  </div>
                ))}

              {periods.filter(
                (period) => !selectedPeriods.some((p) => p.id === period.id)
              ).length === 0 && (
                <div className='flex flex-col items-center justify-center p-4 border border-dashed rounded-md bg-slate-50 text-center col-span-full'>
                  <p className='text-xs text-slate-500'>
                    All periods are already selected
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className='p-3 border-t border-slate-200 bg-slate-50 gap-2'>
            <Button
              variant='outline'
              onClick={() => setPeriodSelectorOpen(false)}
              className='h-8 text-xs text-slate-700 border-slate-300'
            >
              Cancel
            </Button>
            <Button
              variant='default'
              onClick={() => setPeriodSelectorOpen(false)}
              className='h-8 text-xs bg-blue-600 hover:bg-blue-700'
              disabled={selectedPeriods.length === 0}
            >
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
