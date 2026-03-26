'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useCaseTracks } from '@/hooks/case/use-case';
import type { CaseDeliveryFormat } from '@/types/case';

const INSTITUTIONS = [
  'JKKN College of Engineering and Technology',
  'JKKN College of Arts and Science',
  'JKKN College of Education',
  'JKK Nataraja College of Pharmacy',
  'JKK Nataraja Dental College and Hospital',
  'JKK Nataraja College of Nursing',
  'JKK Nataraja College of Allied Health Sciences',
  'JKK Nataraja Matriculation School',
  'JKK Nataraja Vidhyalaya'
];

const DELIVERY_OPTIONS: { value: CaseDeliveryFormat; label: string; description: string }[] = [
  { value: 'spread', label: 'Spread', description: '1 session/week over 8 weeks (30h total)' },
  { value: 'moderate', label: 'Moderate', description: '2 sessions/week over 4 weeks' },
  { value: 'intensive', label: 'Intensive', description: 'Daily sessions over 2 weeks' },
  { value: 'custom', label: 'Custom', description: 'Define your own schedule' }
];

const batchSchema = z.object({
  track_id: z.string().min(1, 'Track is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  delivery_format: z.enum(['spread', 'moderate', 'intensive', 'custom'] as const),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  max_capacity: z.coerce.number().min(5, 'Minimum 5 learners').max(500, 'Maximum 500 learners'),
  facilitator_name: z.string().optional()
}).refine((data) => data.start_date < data.end_date, {
  message: 'End date must be after start date',
  path: ['end_date']
});

export type BatchFormValues = z.infer<typeof batchSchema>;

interface BatchFormProps {
  defaultValues?: Partial<BatchFormValues>;
  onSubmit: (values: BatchFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function BatchForm({ defaultValues, onSubmit, onCancel, isSubmitting }: BatchFormProps) {
  const { data: tracksData, isLoading: tracksLoading } = useCaseTracks();
  const tracks = tracksData ?? [];

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      track_id: '',
      institution_id: '',
      delivery_format: 'spread',
      start_date: '',
      end_date: '',
      max_capacity: 30,
      facilitator_name: '',
      ...defaultValues
    }
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Track */}
        <FormField
          control={form.control}
          name="track_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Track</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={tracksLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={tracksLoading ? 'Loading tracks…' : 'Select a track'} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {tracks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">{t.track_code}</span>
                      {t.track_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Institution */}
        <FormField
          control={form.control}
          name="institution_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Institution</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select institution" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INSTITUTIONS.map((inst) => (
                    <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Delivery Format */}
        <FormField
          control={form.control}
          name="delivery_format"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Delivery Format</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-cols-2 gap-3 mt-1"
                >
                  {DELIVERY_OPTIONS.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`format-${opt.value}`}
                      className="flex flex-col gap-1 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-[#0b6d41] [&:has([data-state=checked])]:bg-green-50/30"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={opt.value} id={`format-${opt.value}`} />
                        <span className="font-medium text-sm">{opt.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground pl-6">{opt.description}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Dates row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Capacity and Facilitator row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="max_capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Capacity</FormLabel>
                <FormControl>
                  <Input type="number" min={5} max={500} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="facilitator_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Facilitator <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="Senior Learner name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting}
            style={{ backgroundColor: '#0b6d41' }}
            className="text-white hover:opacity-90"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Creating…' : 'Create Batch'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
