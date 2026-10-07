// Profile change requests carry only the editable fields (2026-10-07).
// Approval writes every changed field with the service role, so a request
// carrying college_email (read-only) turned whoever held that email into a
// learner's account. The list is enforced by the POST route, by
// createChangeRequest, and again by approveChangeRequest (a request row can be
// written without the route).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  request: null as Record<string, unknown> | null,
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
}));

const f = vi.hoisted(() => {
  const client = () => {
    const from = (table: string) => {
      let op = 'select';
      let payload: unknown = null;
      const done = () => {
        if (op !== 'select') m.writes.push({ table, op, payload });
        if (table === 'profile_change_requests' && op === 'select') return { data: m.request, error: null };
        if (table === 'profile_change_requests' && op === 'update') return { data: { ...m.request, request_status: 'approved' }, error: null };
        if (table === 'learners_profiles' && op === 'select') {
          return { data: { id: 'learner-1', lifecycle_status: 'active', first_name: 'A', last_name: 'B', institution_id: 'inst-1' }, error: null };
        }
        if (table === 'profiles') return { data: { learner_id: 'learner-1', role: 'student' }, error: null };
        return { data: op === 'insert' ? { id: 'req-1' } : null, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
        insert: (p: unknown) => { op = 'insert'; payload = p; return chain; },
        update: (p: unknown) => { op = 'update'; payload = p; return chain; },
        single: async () => done(),
        maybeSingle: async () => (op === 'select' && table === 'profile_change_requests' ? { data: null, error: null } : done()),
        then: (res: (v: unknown) => unknown) => Promise.resolve(done()).then(res),
      };
      return chain;
    };
    return {
      from,
      auth: { getUser: async () => ({ data: { user: { id: 'learner-user' } }, error: null }) },
      rpc: async () => ({ data: true, error: null }),
    };
  };
  return { client };
});

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => f.client(),
  createServiceRoleClient: () => f.client(),
}));
vi.mock('@/lib/utils/activity-logger', () => ({ logActivity: async () => {} }));
vi.mock('@/lib/services/learner-profile-audit-service', () => ({
  LearnerProfileAuditService: { createAuditEntry: async () => {} },
}));

import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { POST } from '@/app/api/learner-profile/change-requests/route';
import { disallowedChangeFields, EDITABLE_PROFILE_FIELDS } from '@/types/learner-profile-change';
import { computeLearnerProfileChanges } from '@/lib/learners/profile-change-diff';
import { readFileSync } from 'fs';
import path from 'path';

// The keys the learner edit screen really sends: the top-level keys of the
// object formatFormDataForAPI returns in the real form (EnquiryForm, which the
// my-profile screen renders with isStudentView).
const FORM_KEYS = (() => {
  const src = readFileSync(
    path.resolve(__dirname, '..', '..', 'app/(routes)/learners/enquiries/_components/enquiry-form.tsx'), 'utf8');
  const start = src.indexOf('const formatFormDataForAPI');
  const ret = src.indexOf('    return {', start);
  const end = src.indexOf('\n    };', ret);
  const block = src.slice(ret, end);
  // top-level keys sit at 6 spaces; the keys of the two gated spreads at 12
  return [...new Set([...block.matchAll(/^(?: {6}| {12})([a-z_0-9]+):/gm)].map((x) => x[1]))];
})();
// Payload keys a learner may NOT change through a request: identity, the
// academic assignment, roll and register numbers, the college email, office
// fields and fees. Every key the form sends is one or the other.
const OFFICE_ONLY = [
  'first_name_tamil', 'last_name_tamil', 'abc_id', 'emis', 'umis',
  'admission_year_id', 'enquiry_date', 'quota_id', 'entry_type',
  'institution_id', 'degree_id', 'department_id', 'program_id', 'academic_year_id', 'semester_id', 'section_id',
  'regulation_id', 'batch_id', 'roll_number', 'register_number', 'college_email', 'learner_type',
  'hostel_category_id', 'mess_category_id', 'reference_type', 'reference_name', 'reference_contact',
  'application_fee', 'university_reg_fee', 'fee_structure_type', 'tuition_fee', 'hostel_fee', 'dayscholar_fee',
  'uniform_fee', 'hospital_training_fee', 'placement_fee', 'fee_items', 'is_profile_complete',
];

const READ_ONLY = { college_email: { old: 'learner.one@jkkn.ac.in', new: 'hr@jkkn.ac.in' } };
const EDITABLE = { permanent_address_street: { old: 'OLD STREET', new: 'NEW STREET' } };
const MESSAGE = /cannot be changed through a profile change request: college_email/;

beforeEach(() => {
  m.request = null;
  m.writes = [];
});

describe('the editable list', () => {
  it('names every key that is not editable, and nothing else', () => {
    expect(disallowedChangeFields({ ...READ_ONLY, ...EDITABLE, role: { old: 'x', new: 'y' } })).toEqual(['college_email', 'role']);
    expect(disallowedChangeFields(EDITABLE)).toEqual([]);
  });
});

describe('the real form\'s payload', () => {
  it('every key the learner edit form sends is either learner-editable or office-only', () => {
    expect(FORM_KEYS.length).toBeGreaterThan(40);
    const unclassified = FORM_KEYS.filter(
      (k) => !(EDITABLE_PROFILE_FIELDS as readonly string[]).includes(k) && !OFFICE_ONLY.includes(k));
    expect(unclassified).toEqual([]);
    // and every editable field is one the form really sends
    expect((EDITABLE_PROFILE_FIELDS as readonly string[]).filter((k) => !FORM_KEYS.includes(k))).toEqual([]);
  });

  it('an address, photo, community, caste and accommodation edit becomes a request the server accepts and approves', async () => {
    const learner: Record<string, unknown> = Object.fromEntries(FORM_KEYS.map((k) => [k, `old-${k}`]));
    // a roll number the learner cannot change is dropped, not refused
    const formData: Record<string, unknown> = { ...learner, roll_number: 'R-2' };
    for (const k of ['permanent_address_street', 'permanent_address_taluk', 'permanent_address_district',
      'permanent_address_pin_code', 'permanent_address_state', 'student_photo_url', 'community_category_id',
      'caste_id', 'accommodation_type_id', 'student_mobile']) formData[k] = `new-${k}`;
    const changes = computeLearnerProfileChanges(formData, learner);
    expect(Object.keys(changes).sort()).toEqual(['accommodation_type_id', 'caste_id', 'community_category_id',
      'permanent_address_district', 'permanent_address_pin_code', 'permanent_address_state', 'permanent_address_street',
      'permanent_address_taluk', 'student_mobile', 'student_photo_url']);

    const res = await POST(new Request('http://localhost/x', {
      method: 'POST', body: JSON.stringify({ learner_id: 'learner-1', changed_fields: changes, fields_summary: Object.keys(changes) }),
    }) as never);
    expect(res.status).toBe(201);

    m.writes = [];
    m.request = { id: 'req-1', learner_id: 'learner-1', request_status: 'pending', changed_fields: changes };
    vi.spyOn(LearnerProfileChangeService as unknown as { checkApprovalPermission: () => Promise<boolean> }, 'checkApprovalPermission')
      .mockResolvedValue(true);
    await LearnerProfileChangeService.approveChangeRequest('req-1', {} as never, 'reviewer-1');
    const learnerWrite = m.writes.find((w) => w.table === 'learners_profiles' && w.op === 'update');
    expect(Object.keys(learnerWrite!.payload as object).sort()).toEqual(Object.keys(changes).sort());
  });
});

describe('identity corrections a learner may request (an approver decides)', () => {
  it('a surname correction from the real form becomes a request, and approval writes it', async () => {
    const learner: Record<string, unknown> = Object.fromEntries(FORM_KEYS.map((k) => [k, `old-${k}`]));
    learner.last_name = 'KUMAR';
    const changes = computeLearnerProfileChanges({ ...learner, last_name: 'KUMARAN' }, learner);
    expect(changes).toEqual({ last_name: { old: 'KUMAR', new: 'KUMARAN' } });
    const res = await POST(new Request('http://localhost/x', {
      method: 'POST', body: JSON.stringify({ learner_id: 'learner-1', changed_fields: changes, fields_summary: ['last_name'] }),
    }) as never);
    expect(res.status).toBe(201);
    m.writes = [];
    m.request = { id: 'req-3', learner_id: 'learner-1', request_status: 'pending', changed_fields: changes };
    vi.spyOn(LearnerProfileChangeService as unknown as { checkApprovalPermission: () => Promise<boolean> }, 'checkApprovalPermission')
      .mockResolvedValue(true);
    await LearnerProfileChangeService.approveChangeRequest('req-3', {} as never, 'reviewer-1');
    expect(m.writes.find((w) => w.table === 'learners_profiles' && w.op === 'update')?.payload).toEqual({ last_name: 'KUMARAN' });
  });

  it('an older pending request carrying first_name, date of birth, gender or Aadhaar approves again', async () => {
    m.request = {
      id: 'req-4', learner_id: 'learner-1', request_status: 'pending',
      changed_fields: {
        first_name: { old: 'ASA', new: 'ASHA' }, date_of_birth: { old: '2008-01-01', new: '2008-01-10' },
        gender: { old: 'Male', new: 'Female' }, aadhar_number: { old: '1', new: '2' },
      },
    };
    vi.spyOn(LearnerProfileChangeService as unknown as { checkApprovalPermission: () => Promise<boolean> }, 'checkApprovalPermission')
      .mockResolvedValue(true);
    await LearnerProfileChangeService.approveChangeRequest('req-4', {} as never, 'reviewer-1');
    expect(m.writes.find((w) => w.table === 'learners_profiles' && w.op === 'update')?.payload).toEqual({
      first_name: 'ASHA', date_of_birth: '2008-01-10', gender: 'Female', aadhar_number: '2',
    });
  });
});

describe('POST /api/learner-profile/change-requests', () => {
  const post = (changed_fields: unknown) =>
    POST(new Request('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ learner_id: 'learner-1', changed_fields, fields_summary: ['x'] }),
    }) as never);

  it('a request carrying college_email → 400, nothing stored', async () => {
    const res = await post(READ_ONLY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(MESSAGE);
    expect(m.writes).toEqual([]);
  });
});

describe('LearnerProfileChangeService', () => {
  it('createChangeRequest refuses a read-only field before storing anything', async () => {
    await expect(
      LearnerProfileChangeService.createChangeRequest({ learner_id: 'learner-1', changed_fields: READ_ONLY } as never, 'learner-user')
    ).rejects.toThrow(MESSAGE);
    expect(m.writes).toEqual([]);
  });

  it('approveChangeRequest refuses only a stored request carrying a field a learner may not change, naming it, before any write', async () => {
    m.request = { id: 'req-1', learner_id: 'learner-1', request_status: 'pending', changed_fields: { ...EDITABLE, ...READ_ONLY } };
    await expect(LearnerProfileChangeService.approveChangeRequest('req-1', {} as never, 'reviewer-1')).rejects.toThrow(MESSAGE);
    expect(m.writes).toEqual([]);
    m.request = { id: 'req-2', learner_id: 'learner-1', request_status: 'pending', changed_fields: { roll_number: { old: 'R-1', new: 'R-2' } } };
    await expect(LearnerProfileChangeService.approveChangeRequest('req-2', {} as never, 'reviewer-1'))
      .rejects.toThrow(/cannot be changed through a profile change request: roll_number/);
  });
});
