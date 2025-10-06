// app/(routes)/resource-management/maintenance/_components/maintenance-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { useResources } from '@/hooks/resource-management/use-resources';
import {
  createMaintenanceLogSchema,
  MaintenanceType,
  MaintenancePriority,
  type CreateMaintenanceLogDto
} from '@/types/maintenance';

interface MaintenanceFormProps {
  initialData?: any;
  isEditing?: boolean;
  onSubmit: (data: CreateMaintenanceLogDto) => Promise<void>;
  onCancel: () => void;
}

export function MaintenanceForm({
  initialData,
  isEditing = false,
  onSubmit,
  onCancel
}: MaintenanceFormProps) {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch resources for dropdown
  const { resources = [], loading: resourcesLoading } = useResources();

  const form = useForm<CreateMaintenanceLogDto>({
    resolver: zodResolver(createMaintenanceLogSchema),
    defaultValues: initialData || {
      resource_id: '',
      maintenance_type: MaintenanceType.PREVENTIVE,
      title: '',
      description: '',
      scheduled_date: new Date().toISOString().split('T')[0],
      priority: MaintenancePriority.NORMAL,
      assigned_to_user_id: undefined,
      cost: undefined,
      notes: '',
      attachments: []
    }
  });

  const handleSubmit = async (data: CreateMaintenanceLogDto) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(data);
    } catch (err: any) {
      setError(err.message || 'Failed to save maintenance log');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className='pt-6'>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className='space-y-6'>
            {error && (
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Resource Selection */}
            <FormField
              control={form.control}
              name='resource_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resource *</FormLabel>
                  <Select
                    disabled={isSubmitting || resourcesLoading || isEditing}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select a resource' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {resources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          {resource.name} ({resource.resource_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Maintenance Type */}
            <FormField
              control={form.control}
              name='maintenance_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maintenance Type *</FormLabel>
                  <Select
                    disabled={isSubmitting}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={MaintenanceType.PREVENTIVE}>
                        Preventive
                      </SelectItem>
                      <SelectItem value={MaintenanceType.CORRECTIVE}>
                        Corrective
                      </SelectItem>
                      <SelectItem value={MaintenanceType.PREDICTIVE}>
                        Predictive
                      </SelectItem>
                      <SelectItem value={MaintenanceType.EMERGENCY}>
                        Emergency
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Title */}
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      disabled={isSubmitting}
                      placeholder='e.g., Monthly preventive maintenance'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={isSubmitting}
                      placeholder='Describe the maintenance work to be done...'
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {/* Scheduled Date */}
              <FormField
                control={form.control}
                name='scheduled_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date *</FormLabel>
                    <FormControl>
                      <Input
                        type='date'
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Priority */}
              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority *</FormLabel>
                    <Select
                      disabled={isSubmitting}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select priority' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='1'>Low</SelectItem>
                        <SelectItem value='2'>Normal</SelectItem>
                        <SelectItem value='3'>High</SelectItem>
                        <SelectItem value='4'>Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Cost */}
            <FormField
              control={form.control}
              name='cost'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Cost (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='0.01'
                      min='0'
                      disabled={isSubmitting}
                      placeholder='0.00'
                      {...field}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )
                      }
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the estimated cost for this maintenance
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={isSubmitting}
                      placeholder='Any additional information...'
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className='flex items-center gap-4'>
              <Button
                type='submit'
                disabled={isSubmitting}
                className='flex-1'
              >
                {isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {isEditing ? 'Update Maintenance' : 'Create Maintenance'}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
