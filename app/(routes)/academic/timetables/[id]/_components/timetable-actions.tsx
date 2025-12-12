import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Calendar,
  Settings,
  Save,
  Download,
  Lock,
  Loader2,
  CalendarPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface TimetableActionsProps {
  // Format & Configuration
  timetableFormat: 'regular' | 'batch';
  onFormatChange: (format: 'regular' | 'batch') => void;
  selectedPeriods: any[];
  selectedDays: any[];
  selectedDates?: string[];

  // Permissions
  canEdit: boolean;
  isSuperAdmin: boolean;
  hasAttendance: boolean;
  hasSlots: boolean;

  // State
  savingPeriods: boolean;
  hasUnsavedChanges?: boolean; // Updated: 2025-12-11 - Track unsaved changes to enable/disable save button

  // Actions
  onConfigurePeriods: () => void;
  onConfigureDays: () => void;
  onAddDateRange?: () => void;
  onSaveConfiguration: () => void;
  onExportPDF: () => void;
}

/**
 * Timetable Actions Component
 * Displays action buttons for timetable configuration and management
 */
export function TimetableActions({
  timetableFormat,
  onFormatChange,
  selectedPeriods,
  selectedDays,
  selectedDates = [],
  canEdit,
  isSuperAdmin,
  hasAttendance,
  hasSlots,
  savingPeriods,
  hasUnsavedChanges = false, // Updated: 2025-12-11 - Default to false (no unsaved changes)
  onConfigurePeriods,
  onConfigureDays,
  onAddDateRange,
  onSaveConfiguration,
  onExportPDF
}: TimetableActionsProps) {
  const handleFormatChange = (value: string) => {
    const newFormat = value as 'regular' | 'batch';
    if (newFormat !== timetableFormat) {
      onFormatChange(newFormat);
    }
  };

  const handleConfigurePeriods = () => {
    if (hasAttendance && !isSuperAdmin) {
      toast.error(
        'Cannot configure periods. Attendance has been marked for this timetable.'
      );
      return;
    }
    onConfigurePeriods();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Configure Periods */}
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleConfigurePeriods}
          disabled={hasAttendance && !isSuperAdmin}
        >
          {hasAttendance && !isSuperAdmin && (
            <Lock className="h-3 w-3 mr-1" />
          )}
          <Settings className="h-4 w-4 mr-2" />
          Configure Periods
          <Badge variant="secondary" className="ml-2">
            {selectedPeriods.length}
          </Badge>
        </Button>
      )}

      {/* Timetable Format Selector */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Select
                value={timetableFormat}
                onValueChange={handleFormatChange}
                disabled={hasSlots}
              >
                <SelectTrigger
                  className={cn(
                    'w-[180px] h-9',
                    hasSlots && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <SelectValue placeholder="Timetable Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular (Day-wise)</SelectItem>
                  <SelectItem value="batch">Batch (Date-wise)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TooltipTrigger>
          {hasSlots && (
            <TooltipContent>
              <p>
                Cannot change format when slots exist. Delete all slots first
                to change format.
              </p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {/* Configure Days (Regular Mode Only) */}
      {timetableFormat === 'regular' && canEdit && (
        <Button variant="outline" size="sm" onClick={onConfigureDays}>
          <Calendar className="h-4 w-4 mr-2" />
          Configure Days
          <Badge variant="secondary" className="ml-2">
            {selectedDays.length}
          </Badge>
        </Button>
      )}

      {/* Add Date Range (Batch Mode Only) */}
      {timetableFormat === 'batch' && canEdit && onAddDateRange && (
        <Button variant="outline" size="sm" onClick={onAddDateRange}>
          <CalendarPlus className="h-4 w-4 mr-2" />
          Add Date Range
          <Badge variant="secondary" className="ml-2">
            {selectedDates.length}
          </Badge>
        </Button>
      )}

      {/* Save Configuration */}
      {/* Updated: 2025-12-11 - Disabled by default, only enabled when there are unsaved changes */}
      {canEdit && (!hasAttendance || isSuperAdmin) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onSaveConfiguration}
                  disabled={savingPeriods || !hasUnsavedChanges || (hasAttendance && !isSuperAdmin)}
                  className={cn(
                    'bg-green-600 hover:bg-green-700',
                    !hasUnsavedChanges && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {savingPeriods ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {!hasUnsavedChanges && !savingPeriods && (
              <TooltipContent>
                <p>No changes to save</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Export PDF */}
      <Button variant="outline" size="sm" onClick={onExportPDF}>
        <Download className="h-4 w-4 mr-2" />
        Export PDF
      </Button>
    </div>
  );
}
