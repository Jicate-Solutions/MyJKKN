'use client';

import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { format, setMonth, setYear, startOfMonth } from 'date-fns';
import {
  DayPicker,
  useDayPicker,
  useNavigation,
  type CaptionProps
} from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const DEFAULT_YEARS_BACK = 30;
const DEFAULT_YEARS_AHEAD = 10;

/**
 * Caption with month and year pickers, used whenever `captionLayout` asks for
 * dropdowns. It replaces react-day-picker's native <select> elements with the
 * app's own Select so the calendar header matches every other dropdown, and so
 * a back-dated month (a 2022 batch edited in 2026) is one click away instead of
 * dozens of arrow presses.
 */
function DropdownCaption({ displayMonth }: CaptionProps) {
  const { fromDate, toDate, labels, locale } = useDayPicker();
  const { goToMonth, previousMonth, nextMonth } = useNavigation();

  const displayedYear = displayMonth.getFullYear();
  const fromYear = fromDate?.getFullYear() ?? displayedYear - DEFAULT_YEARS_BACK;
  const toYear = toDate?.getFullYear() ?? displayedYear + DEFAULT_YEARS_AHEAD;

  const years = React.useMemo(() => {
    const list: number[] = [];
    for (let year = fromYear; year <= toYear; year++) list.push(year);
    return list;
  }, [fromYear, toYear]);

  // Only the months inside the allowed range are offered, so the header can
  // never land on a month the day grid would refuse.
  const firstMonth =
    fromDate && displayedYear === fromYear ? fromDate.getMonth() : 0;
  const lastMonth = toDate && displayedYear === toYear ? toDate.getMonth() : 11;

  const months = React.useMemo(() => {
    const list: Array<{ value: number; label: string }> = [];
    for (let month = firstMonth; month <= lastMonth; month++) {
      list.push({
        value: month,
        label: format(new Date(2000, month, 1), 'LLLL', { locale })
      });
    }
    return list;
  }, [firstMonth, lastMonth, locale]);

  const handleYearChange = (value: string) => {
    const nextDate = startOfMonth(setYear(displayMonth, Number(value)));
    // Clamp, in case the current month falls outside the new year's range.
    if (fromDate && nextDate < startOfMonth(fromDate)) {
      goToMonth(startOfMonth(fromDate));
      return;
    }
    if (toDate && nextDate > startOfMonth(toDate)) {
      goToMonth(startOfMonth(toDate));
      return;
    }
    goToMonth(nextDate);
  };

  return (
    <div className='flex items-center justify-between gap-1 pt-1'>
      <button
        type='button'
        aria-label={labels.labelPrevious(previousMonth)}
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:pointer-events-none'
        )}
      >
        <ChevronLeftIcon className='h-4 w-4' />
      </button>

      <div className='flex flex-1 items-center justify-center gap-1'>
        <Select
          value={String(displayMonth.getMonth())}
          onValueChange={(value) =>
            goToMonth(startOfMonth(setMonth(displayMonth, Number(value))))
          }
        >
          <SelectTrigger
            aria-label='Month'
            className='h-7 w-[7.5rem] px-2 text-sm font-medium'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='max-h-60'>
            {months.map((month) => (
              <SelectItem key={month.value} value={String(month.value)}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(displayedYear)} onValueChange={handleYearChange}>
          <SelectTrigger
            aria-label='Year'
            className='h-7 w-[5.5rem] px-2 text-sm font-medium'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='max-h-60'>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type='button'
        aria-label={labels.labelNext(nextMonth)}
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:pointer-events-none'
        )}
      >
        <ChevronRightIcon className='h-4 w-4' />
      </button>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  const usesDropdownCaption = props.captionLayout?.startsWith('dropdown');

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'space-x-1 flex items-center',
        nav_button: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
        ),
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell:
          'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
        row: 'flex w-full mt-2',
        cell: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
            : '[&:has([aria-selected])]:rounded-md'
        ),
        day: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-8 w-8 p-0 font-normal aria-selected:opacity-100'
        ),
        day_range_start: 'day-range-start',
        day_range_end: 'day-range-end',
        day_selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        day_today: 'bg-accent text-accent-foreground',
        day_outside:
          'day-outside text-muted-foreground opacity-50  aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
        day_disabled: 'text-muted-foreground opacity-50',
        day_range_middle:
          'aria-selected:bg-accent aria-selected:text-accent-foreground',
        day_hidden: 'invisible',
        ...classNames
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeftIcon className='h-4 w-4' />,
        IconRight: ({ ...props }) => <ChevronRightIcon className='h-4 w-4' />,
        ...(usesDropdownCaption ? { Caption: DropdownCaption } : {}),
        ...components
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
