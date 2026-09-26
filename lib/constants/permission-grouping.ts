/**
 * Display-only grouping of PERMISSION_CATEGORIES for the Role Management
 * permission editor: module → sub-module.
 *
 * Nothing here changes a permission key or a category key. The audit gate
 * (lib/permissions-audit/module-mappings.ts), the check:* scripts and RLS all
 * read PERMISSION_CATEGORIES / the flat keys directly, so this file may merge
 * and split categories for presentation freely.
 */
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';

export interface PermissionItem {
  key: string;
  label: string;
}

export interface PermissionSubGroup {
  key: string;
  label: string;
  permissions: PermissionItem[];
}

export interface PermissionModuleGroup {
  key: string;
  name: string;
  subGroups: PermissionSubGroup[];
  permissions: PermissionItem[];
}

// Categories shown inside another module instead of as their own row. The
// people domain is one "HR Management" section in the sidebar, so it is one
// module here too.
const MODULE_MERGES: Record<string, string[]> = {
  hr: ['hr', 'staff', 'hr_counseling', 'hr_promotion', 'sams', 'hr_phase_0_config']
};

const SELF_SERVICE_LEAVE_KEYS = new Set([
  'hr.leave.apply',
  'hr.leave.cancel',
  'hr.leave.withdraw'
]);

// Ordered — first match wins. Mirrors the HR Management rows in
// lib/sidebarMenuLink.ts. Anything unmatched lands in HR Setup.
const HR_SUB_MODULES: { label: string; match: (key: string) => boolean }[] = [
  {
    label: 'Staff Counseling',
    match: (k) =>
      k.startsWith('hr.counseling.') ||
      k.startsWith('hr.grievance.') ||
      k.startsWith('hr.career_development.')
  },
  {
    label: 'Self Service',
    match: (k) =>
      SELF_SERVICE_LEAVE_KEYS.has(k) ||
      (k.startsWith('hr.') && /_(own|self)$/.test(k))
  },
  {
    label: 'Employee',
    match: (k) =>
      k.startsWith('staff.') ||
      k.startsWith('hr.employees.') ||
      k.startsWith('hr.staff_photo.') ||
      k.startsWith('hr.sanctioned_posts.')
  },
  {
    label: 'Lifecycle & Promotion',
    match: (k) => k.startsWith('hr.onboarding.') || k.startsWith('hr.promotion.')
  },
  { label: 'Recruitment', match: (k) => k.startsWith('hr.recruitment.') },
  {
    label: 'Leave',
    match: (k) => k.startsWith('hr.leave.') || k.startsWith('hr.academic_years.')
  },
  {
    label: 'Attendance & Time',
    match: (k) => k.startsWith('hr.attendance.') || k.startsWith('hr.shift_timings.')
  },
  { label: 'Payroll', match: (k) => k.startsWith('hr.payroll.') },
  {
    label: 'Development & Appraisal',
    match: (k) => k.startsWith('hr.training.') || k.startsWith('sams.')
  },
  { label: 'Engagement', match: (k) => k.startsWith('hr.policies.') },
  { label: 'HR Setup', match: () => true }
];

const GENERAL = 'General';

const titleCase = (segment: string) =>
  segment
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

function groupHr(moduleKey: string, permissions: PermissionItem[]): PermissionSubGroup[] {
  const buckets = new Map<string, PermissionItem[]>();
  HR_SUB_MODULES.forEach((s) => buckets.set(s.label, []));
  permissions.forEach((p) => {
    const sub = HR_SUB_MODULES.find((s) => s.match(p.key))!;
    buckets.get(sub.label)!.push(p);
  });
  return [...buckets.entries()]
    .filter(([, perms]) => perms.length > 0)
    .map(([label, perms]) => ({ key: `${moduleKey}:${label}`, label, permissions: perms }));
}

// `billing.fee_structures.view` → "Fee Structures". Two-segment keys
// (`staff.view`) and sub-modules of one key go to "General".
function groupBySecondSegment(
  moduleKey: string,
  permissions: PermissionItem[]
): PermissionSubGroup[] {
  const buckets = new Map<string, PermissionItem[]>();
  permissions.forEach((p) => {
    const parts = p.key.split('.');
    const sub = parts.length >= 3 ? parts[1] : GENERAL;
    if (!buckets.has(sub)) buckets.set(sub, []);
    buckets.get(sub)!.push(p);
  });

  const general: PermissionItem[] = [];
  const named: PermissionSubGroup[] = [];
  buckets.forEach((perms, sub) => {
    if (sub === GENERAL || perms.length < 2) general.push(...perms);
    else named.push({ key: `${moduleKey}:${sub}`, label: titleCase(sub), permissions: perms });
  });

  if (general.length > 0) {
    named.unshift({ key: `${moduleKey}:${GENERAL}`, label: GENERAL, permissions: general });
  }
  return named;
}

let cached: PermissionModuleGroup[] | null = null;

export function buildPermissionModuleGroups(): PermissionModuleGroup[] {
  if (cached) return cached;

  const byKey = new Map(PERMISSION_CATEGORIES.map((c) => [c.key, c]));
  const absorbed = new Set(
    Object.entries(MODULE_MERGES).flatMap(([host, members]) =>
      members.filter((m) => m !== host)
    )
  );

  const groups: PermissionModuleGroup[] = [];
  PERMISSION_CATEGORIES.forEach((category) => {
    if (absorbed.has(category.key)) return;

    const memberKeys = MODULE_MERGES[category.key] ?? [category.key];
    const seen = new Set<string>();
    const permissions: PermissionItem[] = [];
    memberKeys.forEach((mk) => {
      byKey.get(mk)?.permissions.forEach((p) => {
        if (seen.has(p.key)) return;
        seen.add(p.key);
        permissions.push({ key: p.key, label: p.label });
      });
    });
    if (permissions.length === 0) return;

    const subGroups =
      category.key === 'hr'
        ? groupHr(category.key, permissions)
        : groupBySecondSegment(category.key, permissions);

    groups.push({ key: category.key, name: category.name, subGroups, permissions });
  });

  cached = groups;
  return groups;
}
