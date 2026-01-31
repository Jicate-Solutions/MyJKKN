import { useState, useCallback } from 'react';
import { Period, DayOfWeek } from '@/types/academics';

interface DialogControl {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export interface UseTimetableDialogsResult {
  // Dialog Controls
  slotDialog: DialogControl & {
    data: {
      selectedDay: DayOfWeek | null;
      selectedPeriod: Period | null;
      selectedSlot: any | null;
      readOnly: boolean;
    };
    openWith: (day: DayOfWeek, period: Period, existingSlot?: any, readOnly?: boolean) => void;
  };

  subdivisionDialog: DialogControl & {
    data: {
      type: string;
      mode: string;
      pendingSlotData: any | null;
      pendingPeriod: Period | null;
      pendingDay: DayOfWeek | string | null;
      allStudents: any[];
    };
    openWith: (config: {
      type?: string;
      mode?: string;
      slotData?: any;
      period?: Period;
      day?: DayOfWeek | string;
      students?: any[];
    }) => void;
    setType: (type: string) => void;
    setMode: (mode: string) => void;
    setPendingSlotData: (data: any | null) => void;
    setAllStudents: (students: any[]) => void;
  };

  periodSelectorDialog: DialogControl;
  templateDialog: DialogControl & {
    data: {
      templateName: string;
      saving: boolean;
    };
    setTemplateName: (name: string) => void;
    setSaving: (saving: boolean) => void;
  };

  deleteDialog: DialogControl & {
    data: {
      slotToDelete: any | null;
    };
    openWith: (slot: any) => void;
    clearSlot: () => void;
  };

  dayConfigDialog: DialogControl;
  addDateRangeDialog: DialogControl & {
    data: {
      startDate: Date | undefined;
      endDate: Date | undefined;
    };
    setStartDate: (date: Date | undefined) => void;
    setEndDate: (date: Date | undefined) => void;
    clear: () => void;
  };

  unsavedChangesDialog: DialogControl & {
    data: {
      pendingNavigation: string | null;
    };
    setPendingNavigation: (path: string | null) => void;
  };
}

/**
 * Custom hook for managing all timetable dialog states
 * Centralizes dialog state management and provides clean API
 */
export function useTimetableDialogs(): UseTimetableDialogsResult {
  // Slot Dialog State
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotDialogReadOnly, setSlotDialogReadOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);

  // Subdivision Dialog State
  const [subdivisionDialogOpen, setSubdivisionDialogOpen] = useState(false);
  const [subdivisionType, setSubdivisionType] = useState('practical');
  const [subdivisionMode, setSubdivisionMode] = useState('auto');
  const [pendingSlotData, setPendingSlotData] = useState<any | null>(null);
  const [pendingPeriod, setPendingPeriod] = useState<Period | null>(null);
  const [pendingDay, setPendingDay] = useState<DayOfWeek | string | null>(null);
  const [allStudentsForSubdivision, setAllStudentsForSubdivision] = useState<any[]>([]);

  // Period Selector Dialog State
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);

  // Template Dialog State
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<any | null>(null);

  // Day Config Dialog State
  const [dayConfigOpen, setDayConfigOpen] = useState(false);

  // Add Date Range Dialog State
  const [addDateRangeOpen, setAddDateRangeOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState<Date | undefined>();
  const [newEndDate, setNewEndDate] = useState<Date | undefined>();

  // Unsaved Changes Dialog State
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Slot Dialog Control
  const openSlotDialog = useCallback((
    day: DayOfWeek,
    period: Period,
    existingSlot?: any,
    readOnly = false
  ) => {
    // FIX: 2026-01-31 - Add setTimeout to prevent Radix Dialog race condition
    // When dialog closes and reopens quickly, Radix needs time to clean up
    setTimeout(() => {
      setSelectedDay(day);
      setSelectedPeriod(period);
      setSelectedSlot(existingSlot || null);
      setSlotDialogReadOnly(readOnly);
      setSlotDialogOpen(true);
    }, 0);
  }, []);

  // Subdivision Dialog Control
  const openSubdivisionDialog = useCallback((config: {
    type?: string;
    mode?: string;
    slotData?: any;
    period?: Period;
    day?: DayOfWeek | string;
    students?: any[];
  }) => {
    // FIX: 2026-01-31 - Add setTimeout to prevent Radix Dialog race condition
    setTimeout(() => {
      if (config.type) setSubdivisionType(config.type);
      if (config.mode) setSubdivisionMode(config.mode);
      if (config.slotData !== undefined) setPendingSlotData(config.slotData);
      if (config.period) setPendingPeriod(config.period);
      if (config.day) setPendingDay(config.day);
      if (config.students) setAllStudentsForSubdivision(config.students);
      setSubdivisionDialogOpen(true);
    }, 0);
  }, []);

  // Delete Dialog Control
  const openDeleteDialog = useCallback((slot: any) => {
    setSlotToDelete(slot);
    setDeleteDialogOpen(true);
  }, []);

  // Date Range Dialog Clear
  const clearDateRange = useCallback(() => {
    setNewStartDate(undefined);
    setNewEndDate(undefined);
  }, []);

  // FIX: 2026-01-31 - Proper cleanup on dialog close
  const closeSlotDialog = useCallback(() => {
    setSlotDialogOpen(false);
    // Clear state after dialog animation completes
    setTimeout(() => {
      setSelectedDay(null);
      setSelectedPeriod(null);
      setSelectedSlot(null);
      setSlotDialogReadOnly(false);
    }, 150); // Wait for Radix close animation
  }, []);

  // FIX: 2026-01-31 - Proper cleanup on subdivision dialog close
  const closeSubdivisionDialog = useCallback(() => {
    setSubdivisionDialogOpen(false);
    // Clear state after dialog animation completes
    setTimeout(() => {
      setSubdivisionType('practical');
      setSubdivisionMode('auto');
      setPendingSlotData(null);
      setPendingPeriod(null);
      setPendingDay(null);
      setAllStudentsForSubdivision([]);
    }, 150); // Wait for Radix close animation
  }, []);

  return {
    // Slot Dialog
    slotDialog: {
      isOpen: slotDialogOpen,
      open: () => setSlotDialogOpen(true),
      close: closeSlotDialog,
      data: {
        selectedDay,
        selectedPeriod,
        selectedSlot,
        readOnly: slotDialogReadOnly
      },
      openWith: openSlotDialog
    },

    // Subdivision Dialog
    subdivisionDialog: {
      isOpen: subdivisionDialogOpen,
      open: () => setSubdivisionDialogOpen(true),
      close: closeSubdivisionDialog,
      data: {
        type: subdivisionType,
        mode: subdivisionMode,
        pendingSlotData,
        pendingPeriod,
        pendingDay,
        allStudents: allStudentsForSubdivision
      },
      openWith: openSubdivisionDialog,
      setType: setSubdivisionType,
      setMode: setSubdivisionMode,
      setPendingSlotData,
      setAllStudents: setAllStudentsForSubdivision
    },

    // Period Selector Dialog
    periodSelectorDialog: {
      isOpen: periodSelectorOpen,
      open: () => setPeriodSelectorOpen(true),
      close: () => setPeriodSelectorOpen(false)
    },

    // Template Dialog
    templateDialog: {
      isOpen: templateDialogOpen,
      open: () => setTemplateDialogOpen(true),
      close: () => setTemplateDialogOpen(false),
      data: {
        templateName,
        saving: savingTemplate
      },
      setTemplateName,
      setSaving: setSavingTemplate
    },

    // Delete Dialog
    deleteDialog: {
      isOpen: deleteDialogOpen,
      open: () => setDeleteDialogOpen(true),
      close: () => setDeleteDialogOpen(false),
      data: {
        slotToDelete
      },
      openWith: openDeleteDialog,
      clearSlot: () => setSlotToDelete(null)
    },

    // Day Config Dialog
    dayConfigDialog: {
      isOpen: dayConfigOpen,
      open: () => setDayConfigOpen(true),
      close: () => setDayConfigOpen(false)
    },

    // Add Date Range Dialog
    addDateRangeDialog: {
      isOpen: addDateRangeOpen,
      open: () => setAddDateRangeOpen(true),
      close: () => setAddDateRangeOpen(false),
      data: {
        startDate: newStartDate,
        endDate: newEndDate
      },
      setStartDate: setNewStartDate,
      setEndDate: setNewEndDate,
      clear: clearDateRange
    },

    // Unsaved Changes Dialog
    unsavedChangesDialog: {
      isOpen: showUnsavedChangesDialog,
      open: () => setShowUnsavedChangesDialog(true),
      close: () => setShowUnsavedChangesDialog(false),
      data: {
        pendingNavigation
      },
      setPendingNavigation
    }
  };
}
