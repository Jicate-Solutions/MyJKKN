'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { useUsageReports } from '@/hooks/resource/physical/use-usage-reports';
import { ResourceService } from '@/lib/services/resource/physical/resource-service';
import { Resource } from '@/types/resources';
import { cn } from '@/lib/utils';

interface FilterFormValues {
  resource_id: string;
  start_date: Date | null;
  end_date: Date | null;
}

interface ReportFiltersProps {
  onApply?: () => void;
}

export function ReportFilters({ onApply }: ReportFiltersProps) {
  const { updateFilters } = useUsageReports();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  const form = useForm<FilterFormValues>({
    defaultValues: {
      resource_id: 'all_resources',
      start_date: null,
      end_date: null
    }
  });

  useEffect(() => {
    const fetchResources = async () => {
      try {
        setLoading(true);
        const result = await ResourceService.getResources();
        setResources(result.data);
      } catch (error) {
        console.error('Error fetching resources:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, []);

  const onSubmit = (values: FilterFormValues) => {
    updateFilters({
      resource_id:
        values.resource_id === 'all_resources' ? undefined : values.resource_id,
      start_date: values.start_date
        ? format(values.start_date, 'yyyy-MM-dd')
        : undefined,
      end_date: values.end_date
        ? format(values.end_date, 'yyyy-MM-dd')
        : undefined,
      page: 1
    });

    if (onApply) {
      onApply();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <FormField
            control={form.control}
            name='resource_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resource</FormLabel>
                <Select
                  disabled={loading}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='All Resources' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='all_resources'>All Resources</SelectItem>
                    {resources.map((resource) => (
                      <SelectItem key={resource.id} value={resource.id}>
                        {resource.resource_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='start_date'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        className={cn(
                          'w-full pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          format(field.value, 'PPP')
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date > new Date() ||
                        (form.getValues().end_date
                          ? date > form.getValues().end_date!
                          : false)
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='end_date'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        className={cn(
                          'w-full pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          format(field.value, 'PPP')
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date > new Date() ||
                        (form.getValues().start_date
                          ? date < form.getValues().start_date!
                          : false)
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='flex items-end'>
            <Button type='submit' className='w-full'>
              Apply Filters
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
