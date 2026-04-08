// hooks/admission/use-admission-forms.ts
// React Query hooks for admission form builder
// Added: 2026-04-08

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FormBuilderService } from '@/lib/services/admission/form-builder-service';
import type { CreateAdmissionFormInput } from '@/types/admission';
import toast from 'react-hot-toast';

export function useAdmissionForms(institutionId?: string) {
  return useQuery({
    queryKey: ['admission-forms', institutionId],
    queryFn: () => FormBuilderService.getForms(institutionId),
    enabled: !!institutionId,
  });
}

export function useAdmissionForm(formId: string | undefined) {
  return useQuery({
    queryKey: ['admission-form', formId],
    queryFn: () => FormBuilderService.getFormById(formId!),
    enabled: !!formId,
  });
}

export function useFormTemplates() {
  return useQuery({
    queryKey: ['admission-form-templates'],
    queryFn: () => FormBuilderService.getTemplates(),
  });
}

export function useFormMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admission-forms'] });
    queryClient.invalidateQueries({ queryKey: ['admission-form'] });
  };

  const createForm = useMutation({
    mutationFn: ({ input, userId }: { input: CreateAdmissionFormInput; userId: string }) =>
      FormBuilderService.createForm(input, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Form created');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create form'),
  });

  const createFromTemplate = useMutation({
    mutationFn: ({
      templateId,
      input,
      userId,
    }: {
      templateId: string;
      input: CreateAdmissionFormInput;
      userId: string;
    }) => FormBuilderService.createFormFromTemplate(templateId, input, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Form created from template');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create form'),
  });

  const updateForm = useMutation({
    mutationFn: ({
      formId,
      updates,
    }: {
      formId: string;
      updates: Partial<CreateAdmissionFormInput> & { status?: string };
    }) => FormBuilderService.updateForm(formId, updates),
    // No onSuccess toast — callers use toast.promise() to show contextual
    // loading/success/error messages (e.g., "Saving draft..." vs "Publishing...")
    onSuccess: () => invalidate(),
  });

  const deleteForm = useMutation({
    mutationFn: (formId: string) => FormBuilderService.deleteForm(formId),
    onSuccess: () => {
      invalidate();
      toast.success('Form deleted');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to delete form'),
  });

  const createSection = useMutation({
    mutationFn: ({
      formId,
      section,
    }: {
      formId: string;
      section: Parameters<typeof FormBuilderService.createSection>[1];
    }) => FormBuilderService.createSection(formId, section),
    onSuccess: () => invalidate(),
  });

  const updateSection = useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: any }) =>
      FormBuilderService.updateSection(sectionId, updates),
    onSuccess: () => invalidate(),
  });

  const deleteSection = useMutation({
    mutationFn: (sectionId: string) => FormBuilderService.deleteSection(sectionId),
    onSuccess: () => invalidate(),
  });

  const createField = useMutation({
    mutationFn: ({ formId, field }: { formId: string; field: any }) =>
      FormBuilderService.createField(formId, field),
    onSuccess: () => invalidate(),
  });

  const updateField = useMutation({
    mutationFn: ({ fieldId, updates }: { fieldId: string; updates: any }) =>
      FormBuilderService.updateField(fieldId, updates),
    onSuccess: () => invalidate(),
  });

  const deleteField = useMutation({
    mutationFn: (fieldId: string) => FormBuilderService.deleteField(fieldId),
    onSuccess: () => {
      invalidate();
      toast.success('Field removed');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove field'),
  });

  const reorderFields = useMutation({
    mutationFn: (orders: Parameters<typeof FormBuilderService.reorderFields>[0]) =>
      FormBuilderService.reorderFields(orders),
    onSuccess: () => invalidate(),
  });

  const reorderSections = useMutation({
    mutationFn: (orders: Parameters<typeof FormBuilderService.reorderSections>[0]) =>
      FormBuilderService.reorderSections(orders),
    onSuccess: () => invalidate(),
  });

  return {
    createForm,
    createFromTemplate,
    updateForm,
    deleteForm,
    createSection,
    updateSection,
    deleteSection,
    createField,
    updateField,
    deleteField,
    reorderFields,
    reorderSections,
  };
}
