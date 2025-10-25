import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';

interface DateRangeDialogProps {
  isOpen: boolean;
  startDate: Date | undefined;
  endDate: Date | undefined;
  onClose: () => void;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onAdd: (startDate: Date, endDate: Date) => void;
}

/**
 * Add Date Range Dialog
 * Allows users to add date ranges for batch mode timetables
 */
export function DateRangeDialog({
  isOpen,
  startDate,
  endDate,
  onClose,
  onStartDateChange,
  onEndDateChange,
  onAdd
}: DateRangeDialogProps) {
  const handleClose = () => {
    onClose();
  };

  const handleAdd = () => {
    if (startDate && endDate) {
      onAdd(startDate, endDate);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Date Range to Timetable</DialogTitle>
          <DialogDescription>
            Select a date range to add to your batch timetable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-1">
            <Label htmlFor="new-start-date">Start Date</Label>
            <DatePicker
              date={startDate}
              setDate={(date) => onStartDateChange(date ?? undefined)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-end-date">End Date</Label>
            <DatePicker
              date={endDate}
              setDate={(date) => onEndDateChange(date ?? undefined)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!startDate || !endDate}>
            Add Date Range
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
