'use client';

import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DateInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange'
  > {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  className?: string;
}

export function DateInput({
  value,
  onChange,
  className,
  ...props
}: DateInputProps) {
  return (
    <Input
      type='date'
      value={value ? format(value, 'yyyy-MM-dd') : ''}
      onChange={(e) => {
        const date = new Date(e.target.value);
        if (!isNaN(date.getTime())) {
          onChange?.(date);
        } else {
          onChange?.(undefined);
        }
      }}
      className={cn(
        'w-full focus-visible:ring-2 focus-visible:ring-offset-2',
        '[color-scheme:light]',
        '[&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100',
        className
      )}
      {...props}
    />
  );
}
