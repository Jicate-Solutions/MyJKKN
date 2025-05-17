'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
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
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';

const sectionSchema = z.object({
  section_name: z.string().min(1, 'Name is required'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof sectionSchema>;

interface SectionFormProps {
  section?: Section;
  isEditing?: boolean;
}

export function SectionForm({ section, isEditing }: SectionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {
      section_name: section?.section_name || '',
      is_active: section?.is_active ?? true
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      if (isEditing && section) {
        await SectionService.updateSection(section.id, values);
      } else {
        await SectionService.createSection(values);
      }

      router.push('/organizations/sections');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save section'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-1'>
              {/* Section Name Input */}
              <FormField
                control={form.control}
                name='section_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter section name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Active Status Switch */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this section
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
              ? 'Save Changes'
              : 'Create Section'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
