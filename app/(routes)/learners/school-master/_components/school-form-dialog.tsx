'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';

import { useSchoolDistricts, useCreateSchool, useUpdateSchool } from '@/hooks/use-school-master';
import { BOARD_OF_STUDY_OPTIONS } from '@/lib/constants/learner-dropdown-values';
import { getErrorMessage } from '@/lib/utils';
import type { SchoolMaster, CreateSchoolMasterInput } from '@/types/school-master';

const formSchema = z.object({
  school_name: z.string().min(2, 'School name must be at least 2 characters'),
  district: z.string().min(1, 'District is required'),
  board: z.string().min(1, 'Board is required'),
  pincode: z.string().optional(),
  udise_code: z.string().optional(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  school_name: '',
  district: '',
  board: 'state_board',
  pincode: '',
  udise_code: '',
  is_active: true,
};

interface SchoolFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  school?: SchoolMaster;
  defaultBoard?: string;
  /** Called after a successful create/update (DataTable refetch hook). */
  onSuccess?: () => void;
}

export function SchoolFormDialog({
  open,
  onOpenChange,
  mode,
  school,
  defaultBoard = 'state_board',
  onSuccess,
}: SchoolFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [typeNewDistrict, setTypeNewDistrict] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const board = form.watch('board');
  const { data: districts, isLoading: districtsLoading } = useSchoolDistricts(board, open);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && school) {
      form.reset({
        school_name: school.school_name,
        district: school.district,
        board: school.board,
        pincode: school.pincode ?? '',
        udise_code: school.udise_code ?? '',
        is_active: school.is_active,
      });
      setTypeNewDistrict(false);
    } else {
      form.reset({ ...DEFAULT_VALUES, board: defaultBoard });
      setTypeNewDistrict(false);
    }
  }, [open, mode, school, defaultBoard, form]);

  const createSchool = useCreateSchool();
  const updateSchool = useUpdateSchool();

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload: CreateSchoolMasterInput = {
        school_name: data.school_name.trim(),
        district: data.district.trim(),
        board: data.board,
        pincode: data.pincode?.trim() || null,
        udise_code: data.udise_code?.trim() || null,
        is_active: data.is_active,
      };

      if (mode === 'create') {
        await createSchool.mutateAsync(payload);
        toast.success('School created');
      } else if (school) {
        await updateSchool.mutateAsync({ id: school.id, input: payload });
        toast.success('School updated');
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === '23505') {
        toast.error('School already exists in this district');
      } else {
        toast.error(getErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const districtOptions = (districts ?? []).map((d) => ({
    value: d.district,
    label: `${d.district} (${d.school_count})`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add School' : 'Edit School'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new school to the board + district-wise directory.'
              : 'Update the school details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='school_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>School Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Govt Higher Secondary School' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='board'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Board</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select board' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BOARD_OF_STUDY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
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
              name='district'
              render={({ field }) => (
                <FormItem>
                  <div className='flex items-center justify-between'>
                    <FormLabel>District</FormLabel>
                    <button
                      type='button'
                      className='text-xs text-primary hover:underline'
                      onClick={() => setTypeNewDistrict((v) => !v)}
                    >
                      {typeNewDistrict ? 'Choose from list' : '+ New district'}
                    </button>
                  </div>
                  <FormControl>
                    {typeNewDistrict ? (
                      <Input placeholder='Type district name' {...field} />
                    ) : (
                      <SearchableSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        options={districtOptions}
                        placeholder='Select district'
                        searchPlaceholder='Search districts...'
                        loading={districtsLoading}
                        modal
                        className='w-full'
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='pincode'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Pincode <span className='text-muted-foreground font-normal'>(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., 638183' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='udise_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      UDISE Code <span className='text-muted-foreground font-normal'>(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., 33040100123' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Active</FormLabel>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
              <Button type='submit' disabled={submitting} className='w-full sm:w-auto'>
                {submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
