// ─── Keyboard Shortcuts Registry ─────────────────────────────────────────────
// Maps key combinations to page paths for global navigation shortcuts.
// These are shown in sidebar menu items and in the command palette.

export interface KeyboardShortcut {
  path: string;
  label: string;
  /** Permission key — shortcut only works if user has this permission */
  permission?: string;
}

export const KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcut> = {
  'alt+d': { path: '/', label: 'Dashboard', permission: 'view_dashboard' },
  'alt+a': { path: '/academic/attendance', label: 'Attendance', permission: 'academic.attendance.view' },
  'alt+t': { path: '/academic/timetables', label: 'Timetables', permission: 'academic.timetables.view' },
  'alt+s': { path: '/learners/profiles', label: 'Students', permission: 'learners.profiles.view' },
  'alt+b': { path: '/billing/invoices', label: 'Invoices', permission: 'billing.invoices.view' },
  'alt+r': { path: '/billing/receipts', label: 'Receipts', permission: 'billing.receipts.view' },
  'alt+n': { path: '/admin/notifications', label: 'Notifications', permission: 'notifications.view' },
  'alt+l': { path: '/admission/leads', label: 'Leads', permission: 'admission.leads.view' },
  'alt+w': { path: '/work-pulse', label: 'Work Pulse', permission: 'work_pulse.view' },
  'alt+p': { path: '/profile', label: 'Profile', permission: 'view_profile' },
  'alt+h': { path: '/service-requests', label: 'Help Desk', permission: 'service_requests.submit' },
  'alt+e': { path: '/startup-studio/events', label: 'Startup Studio', permission: 'startup_studio.events.view' },
};

/**
 * Get the keyboard shortcut for a given path, if one exists.
 * Returns the formatted shortcut string (e.g., "Alt+A") or undefined.
 */
export function getShortcutForPath(path: string): string | undefined {
  for (const [key, shortcut] of Object.entries(KEYBOARD_SHORTCUTS)) {
    if (shortcut.path === path) {
      return formatShortcutKey(key);
    }
  }
  return undefined;
}

/**
 * Format a shortcut key string for display.
 * 'alt+a' → 'Alt+A'
 */
export function formatShortcutKey(key: string): string {
  return key
    .split('+')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('+');
}

/**
 * Parse a keyboard event into a shortcut key string.
 * Returns null if the event doesn't match any shortcut pattern.
 */
export function parseKeyboardEvent(e: KeyboardEvent): string | null {
  if (!e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key.length !== 1) return null;
  return `alt+${key}`;
}
