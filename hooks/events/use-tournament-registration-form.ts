// hooks/events/use-tournament-registration-form.ts
// React Query hooks for the event dynamic registration form builder.
//
// An event holds MANY named forms (one per monthly run, say). The list is keyed
// by event; a loaded form is keyed by form id. Structural mutations invalidate
// the whole detail prefix rather than threading a form id through every hook —
// the builder shows one form at a time, so the over-invalidation is free, and
// the list has to refresh anyway because its field/response counts moved.

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

const DETAIL_PREFIX = 'tournament-registration-form';

const KEYS = {
  /** Every form on the event (the picker list). */
  list: (eventId: string) => ['event-registration-forms', eventId] as const,
  /** One loaded form with its sections + fields. */
  form: (formId: string) => [DETAIL_PREFIX, formId] as const,
  /** Prefix match — invalidates every loaded form. */
  allForms: () => [DETAIL_PREFIX] as const,
};

/** Invalidate both the open form and the list whose counts just changed. */
function invalidateForms(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: KEYS.allForms() });
  qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
}

// ─── Forms (list / create / clone / delete) ───────────────────────

/** Every form on the event, with field and response counts. */
export function useEventRegistrationForms(eventId: string) {
  return useQuery({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventRegistrationFormService.listForms(eventId),
    enabled: !!eventId,
  });
}

/** Full form + sections + fields, by FORM id (not event id). */
export function useRegistrationForm(formId: string) {
  return useQuery({
    queryKey: KEYS.form(formId),
    queryFn: () => EventRegistrationFormService.getFormWithFields(formId),
    enabled: !!formId,
  });
}

/** Responses submitted through one form, with answers paired to their labels. */
export function useFormResponses(formId: string, enabled = true) {
  return useQuery({
    queryKey: ['event-registration-form-responses', formId],
    queryFn: () => EventRegistrationFormService.listFormResponses(formId),
    enabled: !!formId && enabled,
  });
}

export function useCreateRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string | null }) =>
      EventRegistrationFormService.createForm(eventId, name, { description }),
    onSuccess: (form) => {
      invalidateForms(qc, eventId);
      toast.success(`"${form.name}" created — it starts closed`);
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to create the form'),
  });
}

/** Copy a form's sections + fields into a new closed form on the same event. */
export function useCloneRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, newName }: { formId: string; newName?: string }) =>
      EventRegistrationFormService.cloneForm(formId, newName),
    onSuccess: () => {
      invalidateForms(qc, eventId);
      toast.success('Form copied — the copy starts closed so you can edit it first');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to copy the form'),
  });
}

export function useDeleteRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) => EventRegistrationFormService.deleteForm(formId),
    onSuccess: () => {
      invalidateForms(qc, eventId);
      toast.success('Form deleted');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to delete the form'),
  });
}

export function useUpdateRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      formId,
      updates,
    }: {
      formId: string;
      updates: {
        is_enabled?: boolean;
        name?: string;
        description?: string | null;
        fee_enabled?: boolean;
        fee_amount?: number;
        fee_label?: string | null;
        starts_at?: string | null;
        ends_at?: string | null;
      };
    }) => EventRegistrationFormService.updateForm(formId, updates),
    onSuccess: () => invalidateForms(qc, eventId),
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to update form'),
  });
}

/** Save the entire form in one atomic RPC (the builder page's only write). */
export function useSaveRegistrationForm(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      formId,
      isEnabled,
      sections,
    }: {
      formId: string;
      isEnabled: boolean;
      sections: SaveFormSectionPayload[];
    }) => EventRegistrationFormService.saveForm(formId, isEnabled, sections),
    onSuccess: () => {
      invalidateForms(qc, eventId);
      toast.success('Registration form saved');
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || 'Failed to save the form'),
  });
}

// ─── Sections ─────────────────────────────────────────────────────

export function useCreateFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, section }: { formId: string; section: CreateFormSectionDto }) =>
      EventRegistrationFormService.createSection(formId, eventId, section),
    onSuccess: () => {
      invalidateForms(qc, eventId);
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
    onSuccess: () => invalidateForms(qc, eventId),
    onError: (e: Error) => toast.error(e.message || 'Failed to update section'),
  });
}

export function useDeleteFormSection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => EventRegistrationFormService.deleteSection(sectionId),
    onSuccess: () => {
      invalidateForms(qc, eventId);
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
    onSuccess: () => invalidateForms(qc, eventId),
    onError: (e: Error) => toast.error(e.message || 'Failed to reorder sections'),
  });
}

// ─── Fields ───────────────────────────────────────────────────────

export function useCreateFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, field }: { formId: string; field: CreateFormFieldDto }) =>
      EventRegistrationFormService.createField(eventId, field, formId),
    onSuccess: () => {
      invalidateForms(qc, eventId);
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
    onSuccess: () => invalidateForms(qc, eventId),
    onError: (e: Error) => toast.error(e.message || 'Failed to update field'),
  });
}

export function useDeleteFormField(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) => EventRegistrationFormService.deleteField(fieldId),
    onSuccess: () => {
      invalidateForms(qc, eventId);
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
    onSuccess: () => invalidateForms(qc, eventId),
    onError: (e: Error) => toast.error(e.message || 'Failed to reorder fields'),
  });
}
