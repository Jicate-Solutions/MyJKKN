// @vitest-environment jsdom
//
// BUG-006271: an HOD could not build a registration form on a GENERAL event —
// her form ended with zero sections although Save returned 204. These tests
// drive the real panel + real React Query hooks against an in-memory service
// and assert what the builder actually sends to save_event_registration_form.
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let searchForm: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchForm ? `form=${searchForm}` : ''),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// Banner card reads the event through use-general-events (Supabase at import).
vi.mock('@/components/events/registration/registration-banner-card', () => ({
  RegistrationBannerCard: () => null,
}));
vi.mock('@/components/events/registration/registration-form-share-dialog', () => ({
  RegistrationFormShareDialog: () => null,
}));
vi.mock('@/hooks/events/use-tournaments', () => ({
  useTournament: () => ({ data: undefined, isLoading: false }),
}));

// In-memory stand-in for the service: one table of forms, sections stored per form.
type Row = Record<string, any>;
const db: { forms: Row[]; sections: Record<string, any[]> } = { forms: [], sections: {} };
const saveForm = vi.fn();
const getFormWithFields = vi.fn();
let nextFormId = 1;

vi.mock('@/lib/services/events/tournament/event-registration-form-service', () => ({
  EventRegistrationFormService: {
    listForms: vi.fn(async (eventId: string) =>
      db.forms
        .filter((f) => f.event_id === eventId)
        .map((f) => ({ ...f, field_count: 0, response_count: 0 }))
    ),
    createForm: vi.fn(async (eventId: string, name: string) => {
      const row = {
        id: `form-new-${nextFormId++}`,
        event_id: eventId,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        is_enabled: false,
        starts_at: null,
        ends_at: null,
        fee_enabled: false,
        fee_amount: 0,
        fee_label: null,
        contact_block: 'top',
      };
      db.forms.push(row);
      return row;
    }),
    updateForm: vi.fn(async (formId: string, updates: Row) => {
      const row = db.forms.find((f) => f.id === formId)!;
      Object.assign(row, updates);
      return row;
    }),
    getFormWithFields: (formId: string) => getFormWithFields(formId),
    saveForm: (formId: string, isEnabled: boolean, sections: any[]) =>
      saveForm(formId, isEnabled, sections),
  },
}));

import { RegistrationFormsPanel } from '@/components/events/registration/registration-forms-panel';

function realGetForm(formId: string) {
  const row = db.forms.find((f) => f.id === formId);
  if (!row) throw new Error('not found');
  return Promise.resolve({ ...row, sections: db.sections[formId] ?? [] });
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RegistrationFormsPanel eventId="ev-1" variant="general" eventName="Cultural" />
    </QueryClientProvider>
  );
}

async function addSectionAndField(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: /add section/i }));
  fireEvent.click(await screen.findByRole('button', { name: /add field/i }));
  const labelInput = await screen.findByPlaceholderText('e.g. T-shirt size');
  fireEvent.change(labelInput, { target: { value: label } });
}

/** The builder's own Save (the schedule / fee cards have Save buttons too). */
function editorSave(): HTMLButtonElement {
  const btn = screen
    .getAllByRole('button', { name: /^save$/i })
    .find((b) => b.querySelector('.lucide-save'));
  if (!btn) throw new Error('builder Save button not found');
  return btn as HTMLButtonElement;
}

function lastSavedSections() {
  expect(saveForm).toHaveBeenCalled();
  return saveForm.mock.calls[saveForm.mock.calls.length - 1][2];
}

beforeEach(() => {
  db.forms = [
    {
      id: 'form-old',
      event_id: 'ev-1',
      name: 'Old form',
      slug: 'old-form',
      is_enabled: true,
      starts_at: null,
      ends_at: null,
      fee_enabled: false,
      fee_amount: 0,
      fee_label: null,
      contact_block: 'top',
    },
  ];
  db.sections = {};
  nextFormId = 1;
  saveForm.mockReset();
  saveForm.mockResolvedValue(undefined);
  getFormWithFields.mockReset();
  getFormWithFields.mockImplementation(realGetForm);
  searchForm = null;
});
afterEach(() => cleanup());

describe('RegistrationFormsPanel save payload [BUG-006271]', () => {
  it('path 1: new form created in the panel, section + field added, Save sends them', async () => {
    searchForm = 'form-old';
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /new form/i }));
    fireEvent.change(await screen.findByLabelText('Form name'), { target: { value: 'October' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('October')).toBeInTheDocument());
    await waitFor(() =>
      expect(getFormWithFields).toHaveBeenCalledWith('form-new-1')
    );

    await addSectionAndField('Roll number');
    fireEvent.click(editorSave());

    await waitFor(() => expect(saveForm).toHaveBeenCalled());
    expect(saveForm.mock.calls[0][0]).toBe('form-new-1');
    const sections = lastSavedSections();
    expect(sections).toHaveLength(1);
    expect(sections[0].fields[0].field_label).toBe('Roll number');
  });

  it('path 2: edit via ?form=<id>, change a setting (PATCH + invalidate) mid-edit, then Save', async () => {
    searchForm = 'form-old';
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <RegistrationFormsPanel eventId="ev-1" variant="general" eventName="Cultural" />
      </QueryClientProvider>
    );
    await addSectionAndField('Department');
    // useUpdateRegistrationForm invalidates every loaded form + the list.
    db.forms[0].name = 'Old form v2';
    await act(async () => {
      await qc.invalidateQueries();
    });
    await waitFor(() => expect(getFormWithFields).toHaveBeenCalledTimes(2));
    expect(screen.getByDisplayValue('Department')).toBeInTheDocument();
    fireEvent.click(editorSave());
    await waitFor(() => expect(saveForm).toHaveBeenCalled());
    expect(lastSavedSections()[0].fields[0].field_label).toBe('Department');
  });

  it('path 3: the first form load fails — no editable builder until it is seeded, so a late load cannot wipe edits', async () => {
    searchForm = 'form-old';
    getFormWithFields.mockImplementationOnce(() => Promise.reject(new Error('JWT expired')));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <RegistrationFormsPanel eventId="ev-1" variant="general" eventName="Cultural" />
      </QueryClientProvider>
    );
    // On main the builder rendered EMPTY and editable here; edits made now were
    // overwritten by the late seed below and Save then sent p_sections = [].
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add section/i })).not.toBeInTheDocument();

    // Any settings PATCH invalidates the form query; the load now succeeds.
    await act(async () => {
      await qc.invalidateQueries();
    });
    await addSectionAndField('Year of study');
    fireEvent.click(editorSave());
    await waitFor(() => expect(saveForm).toHaveBeenCalled());
    const sections = lastSavedSections();
    expect(sections).toHaveLength(1);
    expect(sections[0].fields[0].field_label).toBe('Year of study');
  });
});
