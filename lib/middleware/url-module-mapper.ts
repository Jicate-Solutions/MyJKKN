// ============================================
// URL-TO-MODULE MAPPER
// ============================================
// Created: 2026-02-06
// Purpose: Maps API route URLs to MODULE_NAMES for usage tracking
// ============================================

import { MODULE_NAMES } from '@/types/analytics';
import type { UsageEventType } from '@/types/usage-analytics';
import { EVENT_WEIGHTS } from '@/types/usage-analytics';

interface MappingResult {
  module: string;
  feature: string | null;
  eventType: UsageEventType;
  weight: number;
}

// Routes to exclude from tracking
const EXCLUDED_PATTERNS = [
  /^\/api\/analytics\//,
  /^\/api\/debug\//,
  /^\/api\/auth\/callback/,
  /^\/api\/proxy\//,
  /^\/api\/test-env\//,
  /^\/api\/health/,
  /^\/api\/cron\//,
  /^\/_next\//,
  /^\/favicon/,
];

// URL pattern → module mapping (order matters: more specific patterns first)
const URL_MODULE_MAP: Array<{
  pattern: RegExp;
  module: string;
  feature?: string;
}> = [
  // Academic - Timetables
  { pattern: /\/api\/academic\/timetables\/templates/, module: MODULE_NAMES.ACADEMIC_TIMETABLES, feature: 'templates' },
  { pattern: /\/api\/academic\/timetables/, module: MODULE_NAMES.ACADEMIC_TIMETABLES },
  { pattern: /\/academic\/timetables/, module: MODULE_NAMES.ACADEMIC_TIMETABLES },

  // Academic - Attendance
  { pattern: /\/api\/academic\/attendance\/consolidation/, module: MODULE_NAMES.ACADEMIC_ATTENDANCE, feature: 'consolidation' },
  { pattern: /\/api\/academic\/attendance\/reports/, module: MODULE_NAMES.ACADEMIC_ATTENDANCE, feature: 'reports' },
  { pattern: /\/api\/academic\/attendance/, module: MODULE_NAMES.ACADEMIC_ATTENDANCE },
  { pattern: /\/academic\/attendance/, module: MODULE_NAMES.ACADEMIC_ATTENDANCE },

  // Academic - Staff Planning
  { pattern: /\/api\/academic\/staff-plan/, module: MODULE_NAMES.ACADEMIC_STAFF_PLANNING },
  { pattern: /\/academic\/staff-planning/, module: MODULE_NAMES.ACADEMIC_STAFF_PLANNING },

  // Academic - Periods
  { pattern: /\/api\/academic\/periods/, module: MODULE_NAMES.ACADEMIC_PERIODS },
  { pattern: /\/academic\/periods/, module: MODULE_NAMES.ACADEMIC_PERIODS },

  // Academic - Courses
  { pattern: /\/api\/(?:organizations\/)?courses/, module: MODULE_NAMES.ACADEMIC_COURSES },
  { pattern: /\/organizations\/courses/, module: MODULE_NAMES.ACADEMIC_COURSES },

  // Billing - Invoices
  { pattern: /\/api\/billing\/invoices/, module: MODULE_NAMES.BILLING_INVOICES },
  { pattern: /\/billing\/invoices/, module: MODULE_NAMES.BILLING_INVOICES },

  // Billing - Payments
  { pattern: /\/api\/billing\/payments/, module: MODULE_NAMES.BILLING_PAYMENTS },
  { pattern: /\/billing\/payments/, module: MODULE_NAMES.BILLING_PAYMENTS },

  // Billing - Receipts
  { pattern: /\/api\/billing\/receipts/, module: MODULE_NAMES.BILLING_RECEIPTS },
  { pattern: /\/billing\/receipts/, module: MODULE_NAMES.BILLING_RECEIPTS },

  // Billing - Refunds
  { pattern: /\/api\/billing\/refunds/, module: MODULE_NAMES.BILLING_REFUNDS },
  { pattern: /\/billing\/refunds/, module: MODULE_NAMES.BILLING_REFUNDS },

  // Billing - Bills/Schedule
  { pattern: /\/api\/billing\/schedule/, module: MODULE_NAMES.BILLING_BILLS },
  { pattern: /\/billing\/schedule/, module: MODULE_NAMES.BILLING_BILLS },
  { pattern: /\/api\/billing\/categories/, module: MODULE_NAMES.BILLING_BILLS, feature: 'categories' },
  { pattern: /\/api\/billing\/discounts/, module: MODULE_NAMES.BILLING_BILLS, feature: 'discounts' },

  // Students / Learners
  { pattern: /\/api\/learners\/analytics/, module: MODULE_NAMES.STUDENTS, feature: 'analytics' },
  { pattern: /\/api\/learners/, module: MODULE_NAMES.STUDENTS },
  { pattern: /\/learners\/profiles/, module: MODULE_NAMES.STUDENT_PROFILE },
  { pattern: /\/learners\/analytics/, module: MODULE_NAMES.STUDENTS, feature: 'analytics' },
  { pattern: /\/learners/, module: MODULE_NAMES.STUDENTS },

  // Staff
  { pattern: /\/api\/staff/, module: MODULE_NAMES.STAFF },
  { pattern: /\/staff\/list/, module: MODULE_NAMES.STAFF },
  { pattern: /\/staff\/dashboard/, module: MODULE_NAMES.STAFF_PROFILE, feature: 'dashboard' },

  // Admissions
  { pattern: /\/api\/admissions/, module: MODULE_NAMES.ADMISSIONS },

  // Resource Management
  { pattern: /\/api\/resource-management/, module: MODULE_NAMES.RESOURCE_MANAGEMENT },
  { pattern: /\/resource-management/, module: MODULE_NAMES.RESOURCE_MANAGEMENT },

  // Application Hub
  { pattern: /\/api\/applications/, module: MODULE_NAMES.APPLICATION_HUB },
  { pattern: /\/application-hub/, module: MODULE_NAMES.APPLICATION_HUB },

  // Organization
  { pattern: /\/api\/organizations\/institutions/, module: MODULE_NAMES.ORGANIZATION_INSTITUTIONS },
  { pattern: /\/organizations\/institutions/, module: MODULE_NAMES.ORGANIZATION_INSTITUTIONS },
  { pattern: /\/api\/organizations\/departments/, module: MODULE_NAMES.ORGANIZATION_DEPARTMENTS },
  { pattern: /\/organizations\/departments/, module: MODULE_NAMES.ORGANIZATION_DEPARTMENTS },
  { pattern: /\/api\/organizations\/programs/, module: MODULE_NAMES.ORGANIZATION_PROGRAMS },
  { pattern: /\/organizations\/programs/, module: MODULE_NAMES.ORGANIZATION_PROGRAMS },
  { pattern: /\/api\/organizations\/sections/, module: MODULE_NAMES.ORGANIZATION_SECTIONS },
  { pattern: /\/organizations\/sections/, module: MODULE_NAMES.ORGANIZATION_SECTIONS },

  // Dashboard
  { pattern: /^\/$/, module: MODULE_NAMES.DASHBOARD },
  { pattern: /\/api\/dashboard/, module: MODULE_NAMES.DASHBOARD },

  // Settings
  { pattern: /\/api\/settings/, module: MODULE_NAMES.SETTINGS },
  { pattern: /\/settings/, module: MODULE_NAMES.SETTINGS },

  // Profile
  { pattern: /\/api\/profile/, module: MODULE_NAMES.PROFILE },
  { pattern: /\/profile/, module: MODULE_NAMES.PROFILE },

  // Bug Reports
  { pattern: /\/api\/bug-reports/, module: MODULE_NAMES.BUG_REPORTS },
  { pattern: /\/admin\/bug-reports/, module: MODULE_NAMES.BUG_REPORTS },
  { pattern: /\/my-bug-reports/, module: MODULE_NAMES.BUG_REPORTS },
];

// POST routes that are actually reads (check/validate)
const READ_POST_PATTERNS = [
  /check-/,
  /validate-/,
  /verify-/,
  /search/,
  /filter/,
  /query/,
];

/**
 * Check if a URL should be excluded from tracking
 */
export function shouldExclude(url: string): boolean {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(url));
}

/** A well-formed top-level module slug: `campus-living`, `okr`, `rcltp`. */
const MODULE_SLUG_RE = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Derive a module from the first path segment of a PAGE url.
 *
 * WHY NO WHITELIST: `URL_MODULE_MAP` above names 12 top-level prefixes and
 * `lib/navigation/modules.ts` names 41 — but `app/(routes)/` holds 61 real
 * module directories. Both curated lists have drifted (okr, cdc, pde, rcltp,
 * foundation, improvement-board … are in neither). Validating against either
 * one would silently drop two-thirds of the platform and re-drift the moment
 * module 62 lands. A slug-shape check instead means every module — including
 * ones not yet built — is covered with zero upkeep.
 *
 * Trade-off accepted: a 404 renders inside `app/(routes)/layout.tsx`, so a
 * mistyped `/asdfgh` can log one row under module `asdfgh`. Low volume, and it
 * groups visibly in `module_usage_daily` rather than corrupting a real module.
 *
 * Returns null for API paths — those keep the explicit-map-only behaviour that
 * `withUsageTracking` already depends on.
 */
export function mapPathToModuleFallback(pathname: string): string | null {
  if (pathname.startsWith('/api/')) return null;

  const segments = pathname.split('/').filter(Boolean);
  // Root `/` is the Dashboard landing (MODULES lists it as slug '').
  if (segments.length === 0) return 'dashboard';

  const slug = segments[0].toLowerCase();
  return MODULE_SLUG_RE.test(slug) ? slug : null;
}

/**
 * Map a request URL and method to a module and event type
 */
export function mapUrlToModule(
  url: string,
  method: string
): MappingResult | null {
  // Strip query string
  const pathname = url.split('?')[0];

  // Check exclusions
  if (shouldExclude(pathname)) {
    return null;
  }

  // Find matching module
  let matchedModule: string | null = null;
  let matchedFeature: string | null = null;

  for (const mapping of URL_MODULE_MAP) {
    if (mapping.pattern.test(pathname)) {
      matchedModule = mapping.module;
      matchedFeature = mapping.feature || null;
      break;
    }
  }

  // The explicit map wins so existing rows keep their fine-grained module
  // ('academic/attendance'), then fall back to the top-level slug for the
  // ~49 modules the map never covered. API paths get no fallback.
  if (!matchedModule) {
    matchedModule = mapPathToModuleFallback(pathname);
  }

  if (!matchedModule) {
    return null;
  }

  // Determine event type from HTTP method
  const upperMethod = method.toUpperCase();
  let eventType: UsageEventType;

  switch (upperMethod) {
    case 'GET':
      eventType = 'view';
      break;
    case 'POST':
      // Check if this is a read-like POST (check, validate, search)
      if (READ_POST_PATTERNS.some((p) => p.test(pathname))) {
        eventType = 'view';
      } else {
        eventType = 'create';
      }
      break;
    case 'PUT':
    case 'PATCH':
      eventType = 'update';
      break;
    case 'DELETE':
      eventType = 'delete';
      break;
    default:
      eventType = 'page_visit';
  }

  return {
    module: matchedModule,
    feature: matchedFeature,
    eventType,
    weight: EVENT_WEIGHTS[eventType],
  };
}
