'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  date: Date | null | undefined;
  setDate: (date: Date | null) => void;
  disabled?: boolean;
}

export function DatePicker({
  date,
  setDate,
  disabled = false
}: DatePickerProps) {
  // Format date as YYYY-MM-DD for input[type=date]
  const formatDateForInput = (date: Date | null | undefined): string => {
    if (!date) return '';
    return format(date, 'yyyy-MM-dd');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setDate(null);
      return;
    }

    const newDate = new Date(value);
    if (!isNaN(newDate.getTime())) {
      setDate(newDate);
    }
  };

  return (
    <div className='relative'>
      <Input
        type='date'
        className={cn('w-full', disabled && 'opacity-50 cursor-not-allowed')}
        value={formatDateForInput(date)}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
