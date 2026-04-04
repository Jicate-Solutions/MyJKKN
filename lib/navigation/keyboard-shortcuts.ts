// ─── Keyboard Shortcuts Registry ─────────────────────────────────────────────
// Maps key combinations to page paths for global navigation shortcuts.
// Hardcoded defaults can be overridden by admin-managed shortcuts from page_metadata.

export interface KeyboardShortcut {
  path: string;
  label: string;
  /** Permission key — shortcut only works if user has this permission */
  permission?: string;
  /** Whether this shortcut was set by admin (dynamic) or is a default */
  isCustom?: boolean;
}

// ─── Default Shortcuts (hardcoded fallbacks) ─────────────────────────────────

export const DEFAULT_KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcut> = {
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

// ─── Active Shortcuts (defaults + admin overrides) ───────────────────────────
// Starts with defaults, gets merged with dynamic shortcuts when loaded.

let _activeShortcuts: Record<string, KeyboardShortcut> = { ...DEFAULT_KEYBOARD_SHORTCUTS };

/**
 * Get the current active shortcuts (defaults merged with admin overrides).
 */
export const KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcut> = new Proxy(
  {} as Record<string, KeyboardShortcut>,
  {
    get(_target, prop: string) {
      return _activeShortcuts[prop];
    },
    ownKeys() {
      return Object.keys(_activeShortcuts);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      if (prop in _activeShortcuts) {
        return { configurable: true, enumerable: true, value: _activeShortcuts[prop] };
      }
      return undefined;
    },
    has(_target, prop: string) {
      return prop in _activeShortcuts;
    },
  }
);

/**
 * Merge admin-managed shortcuts from page_metadata into the active shortcuts.
 * Admin shortcuts override defaults. Called when metadata is loaded.
 *
 * @param dynamicShortcuts - Array of { shortcutKey, path, title } from page_metadata
 */
export function mergeCustomShortcuts(
  dynamicShortcuts: Array<{ shortcutKey: string; path: string; title: string; permission?: string }>
): void {
  // Start fresh from defaults
  const merged = { ...DEFAULT_KEYBOARD_SHORTCUTS };

  // Remove any default shortcuts that conflict with custom assignments
  const customKeys = new Set(dynamicShortcuts.map(s => s.shortcutKey.toLowerCase()));
  for (const key of customKeys) {
    // Custom shortcut overrides the default at that key
    delete merged[key];
  }

  // Add custom shortcuts
  for (const s of dynamicShortcuts) {
    merged[s.shortcutKey.toLowerCase()] = {
      path: s.path,
      label: s.title,
      permission: s.permission,
      isCustom: true,
    };
  }

  _activeShortcuts = merged;
}

/**
 * Get all available shortcut keys (a-z) and their current assignments.
 * Used by the admin UI to show which keys are taken.
 */
export function getShortcutKeyMap(): Array<{
  key: string;
  display: string;
  assignedTo?: { path: string; label: string; isCustom: boolean };
}> {
  const keys = 'abcdefghijklmnopqrstuvwxyz'.split('');
  return keys.map(letter => {
    const altKey = `alt+${letter}`;
    const shortcut = _activeShortcuts[altKey];
    return {
      key: altKey,
      display: `Alt+${letter.toUpperCase()}`,
      assignedTo: shortcut ? { path: shortcut.path, label: shortcut.label, isCustom: !!shortcut.isCustom } : undefined,
    };
  });
}

/**
 * Get the keyboard shortcut for a given path, if one exists.
 */
export function getShortcutForPath(path: string): string | undefined {
  for (const [key, shortcut] of Object.entries(_activeShortcuts)) {
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
 */
export function parseKeyboardEvent(e: KeyboardEvent): string | null {
  if (!e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key.length !== 1) return null;
  return `alt+${key}`;
}
