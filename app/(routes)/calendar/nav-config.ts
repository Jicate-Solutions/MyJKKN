import type { ModuleNavConfig } from '@/lib/navigation/nav-config';

/**
 * Global Calendar — in-page tab bar (AutoTabNav).
 *
 * The sidebar exposes a single '/calendar' row; these tabs surface the two
 * admin sub-pages that were otherwise reachable only by URL / the generic
 * flat fallback.
 *
 * Per-tab visibility is NOT declared here — AutoTabNav.canShowChip() gates each
 * tab by its MENU_PERMISSIONS entry (lib/sidebarMenuLink.ts), the same map the
 * RoutePermissionGuard enforces:
 *   - '/calendar'          → calendar.view            (all calendar viewers)
 *   - '/calendar/holidays' → calendar.holidays.manage (managers only)
 *   - '/calendar/settings' → calendar.config.manage   (super-admin/admin only)
 * So a view-only user sees just "Calendar"; managers see all three.
 *
 * Active-state: 'Calendar' uses matchPaths ['/calendar']; the deeper tabs have
 * more-specific matchPaths, so they win on /calendar/holidays and /calendar/settings
 * (most-specific match), mirroring the audit module's Dashboard-vs-siblings pattern.
 */
const config: ModuleNavConfig = {
  module: 'calendar',
  groups: [
    {
      label: 'Calendar',
      icon: 'Calendar',
      href: '/calendar',
      matchPaths: ['/calendar'],
    },
    {
      label: 'Holidays & Events',
      icon: 'CalendarX2',
      href: '/calendar/holidays',
      matchPaths: ['/calendar/holidays'],
    },
    {
      label: 'Settings',
      icon: 'Settings',
      href: '/calendar/settings',
      matchPaths: ['/calendar/settings'],
    },
  ],
};

export default config;
