'use client';

import { useMemo } from 'react';
import { getPageByPath } from '@/lib/navigation/page-registry';
import type { PageEntry } from '@/lib/navigation/types';

// ─── Contextual Suggestions ──────────────────────────────────────────────────
// Shows related pages based on the current page.
// e.g., on a student profile → suggest "View Attendance", "View Bills"

const CONTEXTUAL_MAP: Record<string, string[]> = {
  // Student-related pages
  '/learners/profiles': ['/academic/attendance', '/billing/schedule/students', '/billing/invoices', '/learners/alumni'],
  '/learners/my-profile': ['/learners/my-timetable', '/learners/my-attendance', '/service-requests/my-requests'],
  '/learners/my-timetable': ['/learners/my-attendance', '/learners/my-profile'],
  '/learners/my-attendance': ['/learners/my-timetable', '/learners/my-profile'],

  // Academic pages
  '/academic/attendance': ['/academic/attendance/dashboard', '/academic/attendance/reports', '/academic/timetables', '/learners/profiles'],
  '/academic/attendance/dashboard': ['/academic/attendance', '/academic/attendance/reports', '/academic/attendance/consolidation'],
  '/academic/timetables': ['/academic/attendance', '/academic/periods', '/academic/staff-planning', '/staff/list'],
  '/academic/staff-planning': ['/academic/timetables', '/staff/list', '/academic/periods'],

  // Billing pages
  '/billing/invoices': ['/billing/receipts', '/billing/schedule', '/billing/reports', '/billing/discounts'],
  '/billing/receipts': ['/billing/invoices', '/billing/schedule', '/billing/reports'],
  '/billing/schedule': ['/billing/invoices', '/billing/receipts', '/billing/categories/parent-categories'],
  '/billing/reports': ['/billing/invoices', '/billing/receipts', '/billing/refunds'],
  '/billing/discounts': ['/billing/invoices', '/billing/schedule'],

  // Admission pages
  '/admission/leads': ['/admission/applications', '/admission/dashboard', '/admission/counselors', '/admission/marketing/chat'],
  '/admission/applications': ['/admission/leads', '/admission/gd-pi', '/admission/dashboard'],
  '/admission/dashboard': ['/admission/analytics', '/admission/leads', '/admission/applications'],
  '/admission/counselors': ['/admission/leads', '/admission/dashboard', '/admission/counselors/daily-view'],

  // Staff pages
  '/staff/list': ['/staff/dashboard', '/staff/category', '/staff/class-incharges', '/academic/timetables'],

  // Organization pages
  '/organizations/departments': ['/organizations/programs', '/organizations/courses', '/staff/list'],
  '/organizations/programs': ['/organizations/courses', '/organizations/semesters', '/organizations/departments'],
  '/organizations/sections': ['/organizations/programs', '/learners/profiles', '/academic/timetables'],

  // Resource pages
  '/resource-management/resources': ['/resource-management/reservations', '/resource-management/categories', '/resource-management/maintenance'],
  '/resource-management/reservations': ['/resource-management/resources', '/resource-management/reservations/approvals'],

  // Service requests
  '/service-requests': ['/service-requests/my-requests', '/service-requests/approvals', '/service-requests/analytics'],

  // Work Pulse
  '/work-pulse': ['/work-pulse/all', '/work-pulse/impact', '/work-pulse/agents'],
};

/**
 * Get contextual page suggestions based on the current pathname.
 * Returns PageEntry[] of related pages the user might want to visit.
 */
export function getContextualSuggestions(pathname: string): PageEntry[] {
  // Try exact match first, then prefix match
  const suggestions = CONTEXTUAL_MAP[pathname] ||
    Object.entries(CONTEXTUAL_MAP).find(([key]) => pathname.startsWith(key))?.[1] ||
    [];

  return suggestions
    .map((path) => getPageByPath(path))
    .filter((page): page is PageEntry => !!page);
}

/**
 * Hook-ready version for use in components.
 */
export function useContextualSuggestions(pathname: string): PageEntry[] {
  return useMemo(() => getContextualSuggestions(pathname), [pathname]);
}
