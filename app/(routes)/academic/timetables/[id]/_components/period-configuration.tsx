'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { Period } from '@/types/academics';
import { SortablePeriodItem } from './sortable-period-item';
import { cn } from '@/lib/utils';

interface PeriodConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPeriods: Period[];
  periods: Period[];
  lockedPeriods: string[];
  hasUnsavedChanges: boolean;
  savingPeriods: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  onRemovePeriod: (id: string) => void;
  onToggleLock: (id: string) => void;
  onSelectAllClassPeriods: () => void;
  onClearAllPeriods: () => void;
  onAddPeriod: (period: Period) => void;
  onSave: () => void;
}

export function PeriodConfiguration({
  isOpen,
  onClose,
  selectedPeriods,
  periods,
  lockedPeriods,
  hasUnsavedChanges,
  savingPeriods,
  onDragEnd,
  onRemovePeriod,
  onToggleLock,
  onSelectAllClassPeriods,
  onClearAllPeriods,
  onAddPeriod,
  onSave
}: PeriodConfigurationProps) {
  const getAvailablePeriods = () => {
    return periods.filter(
      (period) => !selectedPeriods.some((p) => p.id === period.id)
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='w-full max-w-5xl h-[90vh] flex flex-col'>
        <DialogHeader className='bg-gradient-to-r from-slate-50 to-blue-50 p-4 rounded-t-lg border-b border-slate-200'>
          <DialogTitle className='text-slate-800 text-lg'>
            Configure Timetable Periods
          </DialogTitle>
          <DialogDescription>
            <span className='text-slate-600'>
              Manage the periods for your timetable. You can add, remove, and
              reorder periods to customize your schedule.
            </span>
          </DialogDescription>
          <div className='mt-2 text-xs bg-white/60 px-2.5 py-1 rounded-md border border-slate-200 inline-flex gap-1.5 items-center flex-wrap'>
            <Badge
              variant='outline'
              className='bg-blue-600 text-white border-0 h-4'
            >
              {selectedPeriods.length}
            </Badge>
            <span className='text-slate-600'>
              of {periods.length} periods selected
            </span>
            {hasUnsavedChanges && (
              <Badge
                variant='outline'
                className='bg-amber-100 text-amber-700 border-amber-200 h-4 px-1 animate-pulse'
              >
                Unsaved
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className='flex-grow flex flex-col lg:flex-row gap-4 p-4 overflow-hidden'>
          {/* Selected Periods Section */}
          <div className='flex-1 flex flex-col min-h-0'>
            <div className='flex items-center justify-between mb-3 flex-wrap gap-2'>
              <h3 className='text-sm font-medium flex items-center gap-1.5 text-slate-700'>
                <span className='bg-blue-100 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-blue-700 font-bold flex-shrink-0'>
                  1
                </span>
                Selected Periods ({selectedPeriods.length})
              </h3>
              <div className='flex gap-1.5'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => onSelectAllClassPeriods()}
                  className='h-6 text-[10px] text-green-600 border-green-200 hover:bg-green-50'
                >
                  Add All Classes
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => onClearAllPeriods()}
                  className='h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50'
                >
                  Clear All
                </Button>
              </div>
            </div>

            <div className='flex-grow overflow-y-auto space-y-1.5 pr-1'>
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
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
                      onRemove={onRemovePeriod}
                      isLocked={lockedPeriods.includes(period.id)}
                      onToggleLock={onToggleLock}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {selectedPeriods.length === 0 && (
                <div className='flex flex-col items-center justify-center h-full p-8 border border-dashed rounded-md bg-slate-50 text-center'>
                  <p className='text-sm text-slate-500 mb-2'>
                    No periods selected
                  </p>
                  <p className='text-xs text-slate-400 mb-3'>
                    Add periods from the available list to build your timetable
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Available Periods Section */}
          <div className='flex-1 flex flex-col min-h-0'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='text-sm font-medium flex items-center gap-1.5 text-slate-700'>
                <span className='bg-green-100 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-green-700 font-bold flex-shrink-0'>
                  2
                </span>
                Available Periods ({getAvailablePeriods().length})
              </h3>
            </div>

            <div className='flex-grow overflow-y-auto pr-1'>
              <div className='grid grid-cols-1 gap-1.5'>
                {getAvailablePeriods().map((period) => (
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
                      onClick={() => onAddPeriod(period)}
                      title='Add period to timetable'
                    >
                      <Plus className='h-3 w-3' />
                      Add
                    </Button>
                  </div>
                ))}

                {getAvailablePeriods().length === 0 && (
                  <div className='flex flex-col items-center justify-center h-full p-4 border border-dashed rounded-md bg-slate-50 text-center'>
                    <p className='text-xs text-slate-500'>
                      All periods are already selected
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className='p-3 border-t border-slate-200 bg-slate-50 gap-2 mt-auto'>
          <Button
            variant='outline'
            onClick={onClose}
            className='h-8 text-xs text-slate-700 border-slate-300'
            disabled={savingPeriods}
          >
            Cancel
          </Button>
          <Button
            variant='default'
            onClick={onSave}
            className={cn(
              'h-8 text-xs bg-blue-600 hover:bg-blue-700',
              hasUnsavedChanges &&
                'animate-pulse bg-amber-600 hover:bg-amber-700'
            )}
            disabled={savingPeriods || selectedPeriods.length === 0}
          >
            {savingPeriods
              ? 'Saving...'
              : hasUnsavedChanges
              ? 'Save Changes'
              : 'Save Periods'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
