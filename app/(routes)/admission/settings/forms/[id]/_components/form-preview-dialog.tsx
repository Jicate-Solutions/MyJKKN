'use client';

// app/(routes)/admission/settings/forms/[id]/_components/form-preview-dialog.tsx
// Live preview dialog for the form builder — renders PublicFormClient in preview mode
// Added: 2026-04-08

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import PublicFormClient from '@/app/apply/[slug]/_components/public-form-client';
import type {
  AdmissionForm,
  AdmissionFormField,
  AdmissionFormSection,
} from '@/types/admission';
import { Eye } from 'lucide-react';

interface Institution {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Program {
  id: string;
  name: string;
  institution_id: string;
}

interface FormPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AdmissionForm & {
    sections: (AdmissionFormSection & { fields: AdmissionFormField[] })[];
  };
}

export function FormPreviewDialog({ open, onOpenChange, form }: FormPreviewDialogProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadRelations = async () => {
      setIsLoading(true);
      try {
        const supabase = createClientSupabaseClient();

        const institutionIds =
          form.institution_ids && form.institution_ids.length > 0
            ? form.institution_ids
            : [form.institution_id];

        const [institutionsRes, programsRes] = await Promise.all([
          (supabase as any)
            .from('institutions')
            .select('id, name, logo_url')
            .in('id', institutionIds),
          (supabase as any)
            .from('programs')
            .select('id, program_name, display_name, institution_id, is_active')
            .in('institution_id', institutionIds)
            .eq('is_active', true)
            .order('program_name'),
        ]);

        if (cancelled) return;

        // Dedupe duplicate rows (same program across academic years) and
        // project program_name -> name for the client component
        const seen = new Set<string>();
        const normalized = (programsRes.data || [])
          .filter((p: any) => {
            const key = `${p.institution_id}::${p.program_name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((p: any) => ({
            id: p.id,
            name: p.display_name || p.program_name,
            institution_id: p.institution_id,
          }));

        const filteredPrograms =
          form.program_ids && form.program_ids.length > 0
            ? normalized.filter((p: any) => form.program_ids.includes(p.id))
            : normalized;

        setInstitutions(institutionsRes.data || []);
        setPrograms(filteredPrograms);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadRelations();
    return () => {
      cancelled = true;
    };
  }, [open, form.institution_id, form.institution_ids, form.program_ids]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Form Preview
          </DialogTitle>
          <DialogDescription>
            This is how students will see your form. Submissions are disabled in preview.
          </DialogDescription>
        </DialogHeader>

        <div className="border-t pt-4 -mx-6 px-6 bg-gray-50 dark:bg-gray-950 rounded-b-lg">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <Skeleton className="h-8 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <PublicFormClient
              form={form}
              institutions={institutions}
              programs={programs}
              previewMode
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
