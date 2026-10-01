// @vitest-environment jsdom
//
// The staff form, on EDIT, sends only the fields the person changed
// (2026-10-03). It fills defaults for empty columns (gender 'male', marital
// status 'single'), so sending everything made a phone-only edit on someone
// with admin powers look like a change of gender and marital status, and the
// Director's small-fields ruling refused it.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  toasts: [] as string[],
  categories: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/staff/list/staff-1/edit',
}));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(() => {}, {
    success: () => {}, loading: () => {}, dismiss: () => {},
    error: (msg: unknown) => { m.toasts.push(String(msg)); },
  });
  return { toast: t, default: t };
});
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { id: 'hr-1', institution_id: 'inst-1', role: 'hr_head' } }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isInstitutionScoped: false,
    isSuperAdmin: false,
    getModuleScope: () => 'all_institutions',
    canAccess: (module: string) => module !== 'hr.payroll.salary',
  }),
}));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}), createAdminClient: () => ({}) }));
vi.mock('@/lib/services/organization/organization-service', () => ({
  OrganizationService: { getInstitutionNames: async () => [{ id: 'inst-1', name: 'JKKN College' }] },
}));
vi.mock('@/lib/services/staff/category-service', () => ({
  CategoryService: {
    getCategories: async () => ({ data: m.categories }),
  },
}));
vi.mock('@/lib/services/organization/department-service', () => ({
  DepartmentService: { getDepartmentsByInstitution: async () => [] },
}));
vi.mock('@/lib/services/roles/role-service', () => ({
  RoleService: { getStaffAssignableRoles: async () => [{ id: 'r1', role_key: 'administrator', role_name: 'Administrator' }] },
}));
vi.mock('@/lib/services/staff/staff-service', () => ({
  StaffService: {
    updateStaff: async (id: string, data: Record<string, unknown>) => {
      m.updates.push({ id, data });
      return { id };
    },
    createStaff: async () => ({ id: 'new' }),
  },
}));
vi.mock('@/lib/storage/storage-service', () => ({ StorageService: { deleteStaffImageByUrl: async () => {} } }));
vi.mock('@/hooks/staff/use-staff-tags', () => ({ useStaffTags: () => ({ data: [] }) }));
vi.mock('@/hooks/hr/use-staff-payroll', () => ({ useStaffPayer: () => ({ data: null, isFetched: true, isError: false }) }));
vi.mock('@/hooks/hr/use-staff-salaries', () => ({ useStaffCurrentSalary: () => ({ data: null, isFetched: true, isError: false }) }));
vi.mock('@/hooks/hr/use-staff-bank-accounts', () => ({ useStaffBankHistory: () => ({ data: [], isFetched: true, isError: false }) }));
vi.mock('@/hooks/hr/use-hr-org-mappings', () => ({ useHrOrgMappings: () => ({ mappings: [] }) }));

import { StaffForm } from '@/app/(routes)/staff/list/_components/staff-form';

beforeAll(() => {
  // What Radix and the layout code expect from a browser.
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).releasePointerCapture ??= () => {};
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as any;
});
const ADMIN_CATEGORY = { id: 'cat-1', category_name: 'Administration', is_teaching: false, allows_login: true };
afterEach(() => {
  cleanup();
  m.updates = [];
  m.toasts = [];
  m.categories = [ADMIN_CATEGORY];
});
m.categories = [ADMIN_CATEGORY];

// An administrator's record with no gender and no marital status on file.
const RECORD = {
  id: 'staff-1', first_name: 'ASHA', last_name: 'KUMAR', gender: null, marital_status: null,
  date_of_birth: '1990-05-01', email: 'asha@gmail.com', institution_email: 'asha@jkkn.ac.in',
  phone: '9000000000', staff_id: 'JK001', profile_picture: null, address: null, state: 'Tamil Nadu', district: 'Namakkal',
  pincode: null, emergency_contact_name: null, emergency_contact_relationship: null, emergency_contact_phone: null,
  date_of_joining: '2015-06-01', designation: 'Registrar', category_id: 'cat-1', role_key: 'administrator',
  institution_id: 'inst-1', department_id: null, is_active: true, login_enabled: true, tags: [],
  has_extended_profile: false, status: 'draft',
};

describe('StaffForm on edit', () => {
  // Render the record, change only the phone, press Update; return what was sent.
  const editPhoneOnly = async (record: Record<string, unknown>) => {
    const { container } = render(<StaffForm staff={record as never} isEditing />);
    const phone = await waitFor(() => {
      const el = container.querySelector('input[name="phone"]') as HTMLInputElement | null;
      if (!el) throw new Error('phone input not rendered yet');
      return el;
    });
    // let the initial loads settle (categories, roles, institutions)
    await screen.findByText(/Update Employee/);
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.change(phone, { target: { value: '9111111111' } });
    fireEvent.click(screen.getByText(/Update Employee/));
    await waitFor(() => expect(m.updates.length, m.toasts.join(' | ')).toBe(1), { timeout: 10000 });
    return m.updates[0];
  };

  it('editing only the phone sends only the phone, even with no gender on file', { timeout: 30000 }, async () => {
    expect(await editPhoneOnly(RECORD)).toEqual({ id: 'staff-1', data: { phone: '9111111111' } });
  });

  it('a category that disallows login does not turn a phone-only edit into a login change', { timeout: 30000 }, async () => {
    m.categories = [{ ...ADMIN_CATEGORY, allows_login: false }];
    expect(await editPhoneOnly(RECORD)).toEqual({ id: 'staff-1', data: { phone: '9111111111' } });
  });

  it('a category that shows the extended profile does not turn a phone-only edit into a profile-settings change', { timeout: 30000 }, async () => {
    // On the record of someone with admin powers, has_extended_profile is not
    // a small field: sending it made HR Head's phone edit a 403 (2026-10-07).
    m.categories = [{ ...ADMIN_CATEGORY, shows_extended_profile: true }];
    expect(await editPhoneOnly(RECORD)).toEqual({ id: 'staff-1', data: { phone: '9111111111' } });
  });
});
