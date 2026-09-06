'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsAuditService } from '@/lib/services/school-defaults-audit-service';

const editSchema = z.object({
  degree_name: z.string().min(1, 'Degree name is required').max(100),
  department_name: z.string().min(1, 'Department name is required').max(100),
});

type EditFormData = z.infer<typeof editSchema>;

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  degree_id: string | null;
  degree_name: string | null;
  department_id: string | null;
  department_name: string | null;
  learner_count: number;
}

interface EditDefaultsModalProps {
  school: SchoolWithDefaults | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}

export default function EditDefaultsModal({
  school,
  open,
  onOpenChange,
  onRefresh,
}: EditDefaultsModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      degree_name: school?.degree_name || '',
      department_name: school?.department_name || '',
    },
  });

  if (!school || !school.degree_id) return null;

  async function onSubmit(data: EditFormData) {
    try {
      setSaving(true);
      setError(null);
      const supabase = createClientSupabaseClient();

      // Update degree
      if (school.degree_id) {
        const { error: degreeError } = await supabase
          .from('degrees')
          .update({
            degree_name: data.degree_name,
          })
          .eq('id', school.degree_id);

        if (degreeError) throw degreeError;
      }

      // Update department
      if (school.department_id) {
        const { error: deptError } = await supabase
          .from('departments')
          .update({
            department_name: data.department_name,
          })
          .eq('id', school.department_id);

        if (deptError) throw deptError;
      }

      // Log audit trail
      const { data: currentUser } = await supabase.auth.getUser();
      if (currentUser.user?.id) {
        await SchoolDefaultsAuditService.logAction(
          'update',
          school.school_id,
          school.school_name,
          'degree',
          {
            changes: {
              degree_name: { from: school.degree_name, to: data.degree_name },
              department_name: { from: school.department_name, to: data.department_name },
            },
          },
          currentUser.user.id
        );
      }

      await onRefresh();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update defaults');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {school.school_name}</DialogTitle>
          <DialogDescription>
            Update K-12 Program degree and Academic department names
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && <AlertBox type="error" message={error} />}

            <FormField
              control={form.control}
              name="degree_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Degree Name</FormLabel>
                  <FormControl>
                    <Input placeholder="K-12 Program" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="department_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Academic" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>

              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
