'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useResourceRequests } from '@/hooks/resource/use-resource-requests';
import {
  ResourceType,
  RequestPriority,
  RequestStatus
} from '@/types/resources';

interface FilterFormValues {
  search: string;
  resource_type: string;
  priority: string;
  status: string;
}

interface RequestFiltersProps {
  onApply?: () => void;
}

export function RequestFilters({ onApply }: RequestFiltersProps) {
  const { updateFilters } = useResourceRequests();
  const [loading, setLoading] = useState(false);

  const form = useForm<FilterFormValues>({
    defaultValues: {
      search: '',
      resource_type: 'all',
      priority: 'all',
      status: 'all'
    }
  });

  const onSubmit = (values: FilterFormValues) => {
    setLoading(true);
    updateFilters({
      search: values.search || undefined,
      resource_type:
        values.resource_type !== 'all'
          ? (values.resource_type as ResourceType)
          : undefined,
      priority:
        values.priority !== 'all'
          ? (values.priority as RequestPriority)
          : undefined,
      status:
        values.status !== 'all' ? (values.status as RequestStatus) : undefined,
      page: 1
    });
    setLoading(false);

    if (onApply) {
      onApply();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
          <FormField
            control={form.control}
            name='search'
            render={({ field }) => (
              <FormItem className='lg:col-span-2'>
                <FormLabel>Search</FormLabel>
                <FormControl>
                  <div className='relative'>
                    <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                    <Input
                      placeholder='Search by justification or specifications'
                      className='pl-8'
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='resource_type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resource Type</FormLabel>
                <Select
                  disabled={loading}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='All Types' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='all'>All Types</SelectItem>
                    <SelectItem value='equipment'>Equipment</SelectItem>
                    <SelectItem value='facility'>Facility</SelectItem>
                    <SelectItem value='vehicle'>Vehicle</SelectItem>
                    <SelectItem value='other'>Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='priority'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select
                  disabled={loading}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='All Priorities' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='all'>All Priorities</SelectItem>
                    <SelectItem value='low'>Low</SelectItem>
                    <SelectItem value='medium'>Medium</SelectItem>
                    <SelectItem value='high'>High</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='status'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  disabled={loading}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='All Statuses' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='all'>All Statuses</SelectItem>
                    <SelectItem value='pending'>Pending</SelectItem>
                    <SelectItem value='approved'>Approved</SelectItem>
                    <SelectItem value='rejected'>Rejected</SelectItem>
                    <SelectItem value='acquired'>Acquired</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='flex items-end'>
            <Button type='submit' className='w-full' disabled={loading}>
              {loading ? 'Applying...' : 'Apply Filters'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
