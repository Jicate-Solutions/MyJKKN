'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Lock, Unlock, Trash2 } from 'lucide-react';
import { Period } from '@/types/academics';

interface SortablePeriodItemProps {
  period: Period;
  index: number;
  onRemove: (id: string) => void;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
}

export function SortablePeriodItem({
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
