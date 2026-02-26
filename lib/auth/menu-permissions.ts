/**
 * Menu Permissions - Route-to-permission mapping for Edge Runtime proxy
 *
 * This file is intentionally free of 'use client' so it can be imported
 * in proxy.ts (Edge Runtime). The same data is used by sidebarMenuLink.ts
 * (client side) to control menu visibility.
 *
 * IMPORTANT: Do not add any browser APIs, React imports, or 'use client'
 * to this file — it must remain Edge Runtime compatible.
 */

interface MenuPermissions {
  [menuPath: string]: string;
}

export const MENU_PERMISSIONS: MenuPermissions = {
  // Overview
  '/': 'view_dashboard',

  // AI Assistant
  '/ai-query': 'ai_query.view',

  // Profile
  '/profile': 'view_profile',

  // Bug Reports (Student Self-Service)
  '/my-bug-reports': 'learners.bug_reports.view',
  '/bug-leaderboard': 'learners.bug_reports.view',

  // User Management
  '/users': 'users.view',
  '/users/dashboard': 'users.dashboard.view',
  '/users/activity': 'users.activity.view',
  '/users/roles': 'roles.assign',
  '/users/role-management': 'roles.create',

  // Application Hub
  '/application-hub': 'application_hub.view',
  '/application-hub/api-guidelines': 'application_hub.guidelines.view',

  // IMS (Inventory Management System)
  '/ims/dashboard': 'ims.dashboard.view',
  '/ims/inventory/items': 'ims.inventory.view',
  '/ims/inventory/categories': 'ims.inventory.manage',
  '/ims/stock': 'ims.stock.view',
  '/ims/stock/grn': 'ims.grn.view',
  '/ims/stock/grn/new': 'ims.grn.create',
  '/ims/stock/batches': 'ims.stock.manage',
  '/ims/stock/department': 'ims.stock.view',
  '/ims/stock/adjustments': 'ims.stock.manage',
  '/ims/indents': 'ims.indent.view',
  '/ims/indents/new': 'ims.indent.create',
  '/ims/indents/pending': 'ims.indent.approve',
  '/ims/indents/[id]': 'ims.indent.view',
  '/ims/sales': 'ims.sales.manage',
  '/ims/sales/history': 'ims.sales.view',
  '/ims/sales/[id]': 'ims.sales.view',
  '/ims/sales/[id]/receipt': 'ims.sales.view',
  '/ims/reports': 'ims.reports.view',
  '/ims/reports/stock': 'ims.reports.view',
  '/ims/reports/consumption': 'ims.reports.view',
  '/ims/reports/indents': 'ims.reports.view',
  '/ims/reports/sales': 'ims.reports.view',
  '/ims/financial': 'ims.reports.view',
  '/ims/reports/upi':          'ims.reports.view',    // UPI/QR payment report
  '/ims/settings/stores':      'ims.settings.manage', // Store configuration
  '/ims/settings/suppliers': 'ims.settings.manage',
  '/ims/settings/units': 'ims.settings.manage',
  '/ims/settings/unit-conversions': 'ims.settings.manage',

  // Application Management
  '/applications': 'applications.view',
  '/applications/new': 'applications.create',
  '/applications/categories': 'applications.categories.view',

  // Learners Module (Unified) - Using Granular Permissions
  '/learners': 'learners.profiles.view',

  // Learner Portal Routes (Student Self-Service)
  '/learners/my-timetable': 'learners.my-timetable.view',
  '/learners/my-attendance': 'learners.my-attendance.view',
  '/learners/my-profile': 'learners.my-profile.view',

  // Admin Routes
  '/learners/enquiries': 'learners.admissions.view',
  '/learners/enquiries/new': 'learners.admissions.create',
  '/learners/enquiries/[id]': 'learners.admissions.view',
  '/learners/enquiries/[id]/edit': 'learners.admissions.edit',
  '/learners/applications': 'learners.admissions.view',
  '/learners/applications/[id]': 'learners.admissions.view',
  '/learners/applications/[id]/edit': 'learners.admissions.edit',
  '/learners/profiles': 'learners.profiles.view',
  '/learners/profiles/[id]': 'learners.profiles.view',
  '/learners/profiles/[id]/edit': 'learners.edit',
  '/learners/profiles/bulk-edit': 'learners.bulk_edit',
  '/learners/profiles/promotion': 'learners.promotion.view',
  '/learners/alumni': 'learners.alumni.view',
  '/learners/alumni/[id]': 'learners.alumni.view',
  '/learners/analytics': 'learners.dashboard.view',
  '/learners/change-requests': 'learners.change-requests.view',
  '/learners/change-requests/[id]': 'learners.change-requests.view',

  // Organization Management
  '/organizations/dashboard': 'organizations.dashboard.view',
  '/organizations/institutions': 'organizations.institutions.view',
  '/organizations/degrees': 'organizations.degrees.view',
  '/organizations/departments': 'organizations.departments.view',
  '/organizations/programs': 'organizations.programs.view',
  '/organizations/courses': 'organizations.courses.view',
  '/organizations/semesters': 'organizations.semesters.view',
  '/organizations/sections': 'organizations.sections.view',
  '/organizations/courses/new': 'organizations.courses.create',
  '/organizations/courses/mappings': 'organizations.course.mappings.view',
  '/organizations/courses/mappings/new': 'organizations.course.mappings.create',
  '/organizations/courses/mappings/[id]/edit': 'organizations.course.mappings.edit',

  // Staff Management
  '/staff/category': 'staff.categories.view',
  '/staff/list': 'staff.view',
  '/staff/dashboard': 'staff.dashboard.view',

  // Academic Management
  '/academic/years': 'academic.years.view',
  '/academic/leave-calendar': 'academic.leaves.view',
  '/academic/leaves': 'academic.leaves.view',
  '/academic/leaves/new': 'academic.leaves.create',
  '/academic/leaves/[id]': 'academic.leaves.view',
  '/academic/leaves/[id]/edit': 'academic.leaves.edit',
  '/academic/leaves/settings': 'academic.leaves.manage',
  '/academic/leaves/settings/types': 'academic.leaves.manage',
  '/academic/leaves/settings/workflows': 'academic.leaves.manage',

  // Leave/OnDuty Application System
  '/academic/leave-onduty/approvals': 'academic.leave_onduty.approve',
  '/academic/leave-onduty/settings': 'academic.leave_onduty.manage',
  '/academic/leave-onduty/reports': 'academic.leave_onduty.reports',
  '/learners/leave-onduty/apply': 'learners.leave_onduty.apply',
  '/learners/leave-onduty/my-applications': 'learners.leave_onduty.view',

  '/academic/staff-planning': 'academic.staff.planning.view',
  '/academic/timetables': 'academic.timetables.view',
  '/academic/timetables/templates': 'academic.timetables.templates.view',
  '/academic/timetables/templates/analytics': 'academic.timetables.templates.analytics',
  '/academic/timetables/templates/[id]': 'academic.timetables.templates.view',
  '/academic/timetables/new': 'academic.timetables.create',
  '/academic/timetables/[id]': 'academic.timetables.view',
  '/academic/timetables/[id]/edit': 'academic.timetables.edit',
  '/academic/timetables/faculty-calendar': 'faculty.calendar.view',
  '/academic/periods': 'academic.periods.view',
  '/academic/attendance': 'academic.attendance.view',
  '/academic/attendance/dashboard': 'academic.attendance.dashboard.view',
  '/academic/attendance/reports': 'academic.attendance.reports.view',
  '/academic/attendance/consolidation': 'academic.attendance.consolidation.view',

  // Regulations Management
  '/academic/regulations': 'academic.regulations.view',
  '/academic/regulations/new': 'academic.regulations.create',
  '/academic/regulations/[id]/edit': 'academic.regulations.edit',

  // Batches Management
  '/academic/batches': 'academic.batches.view',
  '/academic/batches/new': 'academic.batches.create',
  '/academic/batches/[id]/edit': 'academic.batches.edit',

  // Notification Management
  '/admin/notifications': 'notifications.view',
  '/admin/notifications/new': 'notifications.create',

  // System Management
  '/system/api-management': 'system.api.view',
  '/system/lti-tools': 'lti.tools.view',
  '/admin/bug-reports': 'system.bugs.view',
  '/admin/ai-query-tools': 'super_admin',

  // Lifecycle Analytics
  '/admin/lifecycle': 'admin.lifecycle.view',

  // LTI Monitoring
  '/admin/lti/analytics': 'lti.analytics.view',
  '/admin/lti/grade-sync': 'lti.grade_sync.view',
  '/admin/lti/launches': 'lti.launches.view',

  // Billing Management
  '/billing/categories/parent-categories': 'billing.parent_categories.view',
  '/billing/categories/parent-categories/new': 'billing.parent_categories.create',
  '/billing/categories/parent-categories/[id]/edit': 'billing.parent_categories.edit',
  '/billing/categories/sub-categories': 'billing.sub_categories.view',
  '/billing/categories/sub-categories/new': 'billing.sub_categories.create',
  '/billing/categories/sub-categories/[id]/edit': 'billing.sub_categories.edit',
  '/billing/categories/item-categories': 'billing.item_categories.view',
  '/billing/categories/item-categories/new': 'billing.item_categories.create',
  '/billing/categories/item-categories/[id]/edit': 'billing.item_categories.edit',
  '/billing/schedule': 'billing.schedule.view',
  '/billing/schedule/new': 'billing.schedule.create',
  '/billing/schedule/bulk-create': 'billing.schedule.create',
  '/billing/schedule/[id]': 'billing.schedule.view',
  '/billing/schedule/[id]/edit': 'billing.schedule.update',
  '/billing/schedule/students': 'billing.schedule.view',
  '/billing/schedule/students/[id]': 'billing.schedule.view',
  '/billing/receipts': 'billing.receipts.view',
  '/billing/receipts/new': 'billing.receipts.create',
  '/billing/receipts/[id]': 'billing.receipts.view',
  '/billing/receipts/[id]/edit': 'billing.receipts.edit',
  '/billing/receipts/generate': 'billing.receipts.generate',
  '/billing/discounts': 'billing.discounts.view',
  '/billing/discounts/new': 'billing.discounts.create',
  '/billing/discounts/[id]': 'billing.discounts.view',
  '/billing/discounts/[id]/edit': 'billing.discounts.edit',
  '/billing/refunds': 'billing.refunds.view',
  '/billing/refunds/new': 'billing.refunds.create',
  '/billing/refunds/[id]': 'billing.refunds.view',
  '/billing/refunds/[id]/edit': 'billing.refunds.edit',
  '/billing/refunds/policies': 'billing.refunds.view',
  '/billing/refunds/bulk': 'billing.refunds.create',
  '/billing/invoices': 'billing.invoices.view',
  '/billing/invoices/new': 'billing.invoices.create',
  '/billing/invoices/[id]': 'billing.invoices.view',
  '/billing/invoices/[id]/edit': 'billing.invoices.edit',
  '/billing/reports': 'billing.reports.view',

  // Resource Management
  '/resource-management': 'resources.categories.view',
  '/resource-management/categories': 'resources.categories.view',
  '/resource-management/categories/new': 'resources.categories.create',
  '/resource-management/categories/[id]/edit': 'resources.categories.edit',
  '/resource-management/categories/sub-categories': 'resources.subcategories.view',
  '/resource-management/categories/sub-categories/new': 'resources.subcategories.create',
  '/resource-management/categories/sub-categories/[id]/edit': 'resources.subcategories.edit',
  '/resource-management/resources': 'resources.resources.view',
  '/resource-management/resources/new': 'resources.resources.create',
  '/resource-management/resources/[id]': 'resources.resources.view',
  '/resource-management/resources/[id]/edit': 'resources.resources.edit',
  '/resource-management/reservations': 'resources.reservations.view',
  '/resource-management/reservations/my-reservations': 'resources.reservations.view',
  '/resource-management/reservations/new': 'resources.reservations.create',
  '/resource-management/reservations/[id]': 'resources.reservations.view',
  '/resource-management/reservations/[id]/edit': 'resources.reservations.edit',
  '/resource-management/reservations/approvals': 'resources.approvals.view',
  '/resource-management/maintenance': 'resources.maintenance.view',
  '/resource-management/analytics': 'resources.analytics.view',
  '/resource-management/analytics-dashboard': 'resources.analytics.view',
  '/audit-trail': 'audit.view',

  // Service Requests
  '/service-requests': 'service_requests.submit',
  '/service-requests/my-requests': 'service_requests.view_own',
  '/service-requests/new': 'service_requests.submit',
  '/service-requests/approvals': 'service_requests.approve',
  '/service-requests/analytics': 'service_requests.analytics.view',
  '/service-requests/types': 'service_requests.types.view',
  '/service-requests/types/new': 'service_requests.types.create',
  '/service-requests/types/[id]': 'service_requests.types.view',
  '/service-requests/types/[id]/edit': 'service_requests.types.edit',
  '/service-requests/[id]': 'service_requests.view_own',
  '/service-requests/[id]/edit': 'service_requests.edit_own',
};
