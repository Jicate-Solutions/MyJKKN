'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useCreateCOPQIncident } from '@/hooks/billing/use-billing-copq';
import {
  createCOPQIncidentSchema,
  type CreateCOPQIncidentInput
} from '@/lib/validations/billing-copq';
import {
  COPQ_CATEGORY_LABELS,
  COPQ_CATEGORY_DESCRIPTIONS,
  type COPQCategory
} from '@/types/billing-copq';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

interface COPQIncidentFormProps {
  institutionId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function COPQIncidentForm({
  institutionId,
  onSuccess,
  onCancel
}: COPQIncidentFormProps) {
  const { mutate: createIncident, isPending } = useCreateCOPQIncident();

  const form = useForm<CreateCOPQIncidentInput>({
    resolver: zodResolver(createCOPQIncidentSchema),
    defaultValues: {
      institution_id: institutionId,
      incident_date: format(new Date(), 'yyyy-MM-dd'),
      category: 'invoice_error',
      description: '',
      visible_cost: 0,
      hidden_cost_estimate: 0,
      time_spent_hours: null,
      affected_stakeholders: 1,
      root_cause: null,
      preventive_action: null,
      bill_id: null,
      learner_id: null
    }
  });

  const selectedCategory = form.watch('category') as COPQCategory;

  const onSubmit = (data: CreateCOPQIncidentInput) => {
    createIncident({
      institution_id: institutionId,
      incident_date: data.incident_date,
      category: data.category,
      description: data.description,
      visible_cost: data.visible_cost ?? 0,
      hidden_cost_estimate: data.hidden_cost_estimate ?? 0,
      time_spent_hours: data.time_spent_hours ?? null,
      affected_stakeholders: data.affected_stakeholders ?? 1,
      root_cause: data.root_cause ?? null,
      preventive_action: data.preventive_action ?? null,
      bill_id: data.bill_id ?? null,
      learner_id: data.learner_id ?? null
    }, {
      onSuccess: () => {
        form.reset();
        onSuccess?.();
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <div className='grid gap-4 md:grid-cols-2'>
          {/* Incident Date */}
          <FormField
            control={form.control}
            name='incident_date'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Incident Date</FormLabel>
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
                          format(new Date(field.value), 'PPP')
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
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) =>
                        field.onChange(date ? format(date, 'yyyy-MM-dd') : '')
                      }
                      disabled={(date) =>
                        date > new Date() || date < new Date('2020-01-01')
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category */}
          <FormField
            control={form.control}
            name='category'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select category' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(COPQ_CATEGORY_LABELS).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                {selectedCategory && (
                  <FormDescription>
                    {COPQ_CATEGORY_DESCRIPTIONS[selectedCategory]}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description */}
        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Describe what happened, the impact, and any relevant details...'
                  className='min-h-[100px]'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Provide a clear description of the incident
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid gap-4 md:grid-cols-2'>
          {/* Visible Cost */}
          <FormField
            control={form.control}
            name='visible_cost'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visible Cost (INR)</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min='0'
                    step='0.01'
                    placeholder='0.00'
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormDescription>
                  Direct financial impact (refunds, waivers, etc.)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hidden Cost Estimate */}
          <FormField
            control={form.control}
            name='hidden_cost_estimate'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hidden Cost Estimate (INR)</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min='0'
                    step='0.01'
                    placeholder='0.00'
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormDescription>
                  Staff time, reputation damage, opportunity cost
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          {/* Time Spent */}
          <FormField
            control={form.control}
            name='time_spent_hours'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time Spent (Hours)</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min='0'
                    step='0.25'
                    placeholder='0.00'
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseFloat(e.target.value) : null
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  Staff hours spent addressing this issue
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Affected Stakeholders */}
          <FormField
            control={form.control}
            name='affected_stakeholders'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Affected Stakeholders</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min='1'
                    step='1'
                    placeholder='1'
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  />
                </FormControl>
                <FormDescription>
                  Number of people affected (students, parents, staff)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Root Cause */}
        <FormField
          control={form.control}
          name='root_cause'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Root Cause (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='What was the underlying cause of this issue?'
                  className='min-h-[60px]'
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Preventive Action */}
        <FormField
          control={form.control}
          name='preventive_action'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preventive Action (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='What can be done to prevent this from happening again?'
                  className='min-h-[60px]'
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className='flex justify-end gap-3'>
          {onCancel && (
            <Button type='button' variant='outline' onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type='submit' disabled={isPending}>
            {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Log Incident
          </Button>
        </div>
      </form>
    </Form>
  );
}
