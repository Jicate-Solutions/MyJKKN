// hooks/events/use-tournament-registration-form.ts
// React Query hooks for the tournament dynamic registration form builder.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  EventRegistrationFormService,
  type SaveFormSectionPayload,
} from '@/lib/services/events/tournament/event-registration-form-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  CreateFormSectionDto,
  UpdateFormSectionDto,
  CreateFormFieldDto,
  UpdateFormFieldDto,
} from '@/types/tournament';

const KEYS = {
  form: (eventId: string) => ['tournament-registration-form', eventId] as const,
};

/** Full form + sections + fields for a tournament (lazy-creates the form row). */
export function useRegistrationForm(eventId: string) {
  return useQuery({
    queryKey: KEYS.form(eventId),
    queryFn: () => EventRegistrationFormService.getFormWithFields(eventId),
    enabled: !!eventId,
  });
}

export function useUpdateRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, updates }: { formId: string; updates: { is_enabled?: boolean } }) =>
      EventRegistrationFormService.updateForm(formId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update form'),
  });
}

/** Save the entire form in one atomic RPC (the builder page's only write). */
export function useSaveRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      isEnabled,
      sections,
    }: {
      isEnabled: boolean;
      sections: SaveFormSectionPayload[];
    }) => EventRegistrationFormService.saveForm(eventId, isEnabled, sections),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Registration form saved');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to save the form'),
  });
}

export function useCreateFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, section }: { formId: string; section: CreateFormSectionDto }) =>
      EventRegistrationFormService.createSection(formId, eventId, section),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Section added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add section'),
  });
}

export function useUpdateFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: UpdateFormSectionDto }) =>
      EventRegistrationFormService.updateSection(sectionId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update section'),
  });
}

export function useDeleteFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => EventRegistrationFormService.deleteSection(sectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Section removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove section'),
  });
}

export function useReorderFormSections(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionOrders: { id: string; display_order: number }[]) =>
      EventRegistrationFormService.reorderSections(sectionOrders),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to reorder sections'),
  });
}

export function useCreateFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (field: CreateFormFieldDto) =>
      EventRegistrationFormService.createField(eventId, field),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Field added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add field'),
  });
}

export function useUpdateFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, updates }: { fieldId: string; updates: UpdateFormFieldDto }) =>
      EventRegistrationFormService.updateField(fieldId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update field'),
  });
}

export function useDeleteFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) => EventRegistrationFormService.deleteField(fieldId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.form(eventId) });
      toast.success('Field removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove field'),
  });
}

export function useReorderFormFields(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldOrders: { id: string; display_order: number; section_id: string }[]) =>
      EventRegistrationFormService.reorderFields(fieldOrders),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.form(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to reorder fields'),
  });
}
