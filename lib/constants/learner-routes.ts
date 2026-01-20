/**
 * Centralized registry of all learner-accessible routes in MyJKKN
 *
 * Purpose:
 * - Single source of truth for all learner routes
 * - Easy discovery for developers
 * - Automated route validation
 * - Documentation generation
 */

export type LearnerRouteCategory =
  | 'portal'        // Learner portal (my-* in /learners)
  | 'domain'        // Domain-specific actions (my-* in modules)
  | 'shared';       // Shared user features

export interface LearnerRoute {
  path: string;
  category: LearnerRouteCategory;
  module: string;
  feature: string;
  permission: string | null;
  description: string;
  allowedStatuses: ('active' | 'graduated')[];
  isNew?: boolean;
  movedFrom?: string;
}

export const LEARNER_ROUTES: Record<string, LearnerRoute> = {
  // ========================================
  // CATEGORY: PORTAL (Core learner features in /learners)
  // ========================================

  'learners-dashboard': {
    path: '/learners/dashboard',
    category: 'portal',
    module: 'learners',
    feature: 'Dashboard',
    permission: 'learners.dashboard.view',
    description: 'Learner home dashboard with grades summary, attendance, upcoming classes',
    allowedStatuses: ['active', 'graduated'],
    isNew: true,
  },

  'learners-my-grades': {
    path: '/learners/my-grades',
    category: 'portal',
    module: 'learners',
    feature: 'My Grades',
    permission: 'learners.my-grades.view',
    description: 'View personal grades from LTI tools (MATLAB, external systems)',
    allowedStatuses: ['active', 'graduated'],
  },

  'learners-my-timetable': {
    path: '/learners/my-timetable',
    category: 'portal',
    module: 'learners',
    feature: 'My Timetable',
    permission: 'learners.my-timetable.view',
    description: 'Personal timetable view with class schedule (mobile-optimized)',
    allowedStatuses: ['active', 'graduated'],
  },

  'learners-my-attendance': {
    path: '/learners/my-attendance',
    category: 'portal',
    module: 'learners',
    feature: 'My Attendance',
    permission: 'learners.my-attendance.view',
    description: 'Personal attendance records with analytics and statistics',
    allowedStatuses: ['active', 'graduated'],
    movedFrom: '/learners/attendance',
    isNew: true,
  },

  'learners-my-profile': {
    path: '/learners/my-profile',
    category: 'portal',
    module: 'learners',
    feature: 'My Profile',
    permission: 'learners.my-profile.view',
    description: 'Personal profile, contact information, and account settings',
    allowedStatuses: ['active', 'graduated'],
    isNew: true,
  },

  'learners-my-academic-records': {
    path: '/learners/my-academic-records',
    category: 'portal',
    module: 'learners',
    feature: 'My Academic Records',
    permission: 'learners.my-academic-records.view',
    description: 'Transcripts, certificates, achievements, and academic history',
    allowedStatuses: ['active', 'graduated'],
    isNew: true,
  },

  // ========================================
  // CATEGORY: DOMAIN (Domain-specific actions in their modules)
  // ========================================

  'resources-my-reservations': {
    path: '/resource-management/reservations/my-reservations',
    category: 'domain',
    module: 'resource-management',
    feature: 'My Reservations',
    permission: 'resources.reservations.view',
    description: 'Personal resource bookings and reservation management',
    allowedStatuses: ['active'],
  },

  // ========================================
  // CATEGORY: SHARED (Generic user features)
  // ========================================

  'my-bug-reports': {
    path: '/my-bug-reports',
    category: 'shared',
    module: 'bug-reports',
    feature: 'My Bug Reports',
    permission: null, // User-specific, no permission needed
    description: 'Personal bug reports and issue tracking submissions',
    allowedStatuses: ['active', 'graduated'],
  },

  'notifications': {
    path: '/notifications',
    category: 'shared',
    module: 'notifications',
    feature: 'Notifications',
    permission: 'notifications.view',
    description: 'System notifications and announcements',
    allowedStatuses: ['active', 'graduated'],
  },

} as const;

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get all learner portal routes
 */
export function getLearnerPortalRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.category === 'portal'
  );
}

/**
 * Get all domain-specific routes
 */
export function getDomainSpecificRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.category === 'domain'
  );
}

/**
 * Get routes by module
 */
export function getRoutesByModule(module: string): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.module === module
  );
}

/**
 * Get routes accessible by lifecycle status
 */
export function getRoutesByStatus(
  status: 'active' | 'graduated'
): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(
    route => route.allowedStatuses.includes(status)
  );
}

/**
 * Check if route exists
 */
export function isValidLearnerRoute(path: string): boolean {
  return Object.values(LEARNER_ROUTES).some(route => route.path === path);
}

/**
 * Get route metadata by path
 */
export function getLearnerRouteMetadata(path: string): LearnerRoute | undefined {
  return Object.values(LEARNER_ROUTES).find(route => route.path === path);
}

/**
 * Get new routes (for migration tracking)
 */
export function getNewRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(route => route.isNew);
}

/**
 * Get moved routes (for migration tracking)
 */
export function getMovedRoutes(): LearnerRoute[] {
  return Object.values(LEARNER_ROUTES).filter(route => route.movedFrom);
}
