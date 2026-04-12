'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, lazy, Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { trackPageVisit } from '@/lib/navigation/recent-pages';
import { getPageByPath } from '@/lib/navigation/page-registry';
import { KEYBOARD_SHORTCUTS, parseKeyboardEvent } from '@/lib/navigation/keyboard-shortcuts';

// Lazy-load the modal to avoid triggering data fetches during prerender
const CommandPaletteModal = lazy(() =>
  import('./CommandPaletteModal').then(m => ({ default: m.CommandPaletteModal }))
);

// ─── Context ─────────────────────────────────────────────────────────────────

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export const useCommandPalette = () => useContext(CommandPaletteContext);

// ─── Provider ────────────────────────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // Store permissions ref to avoid re-renders — loaded lazily
  const permissionsRef = useRef<Record<string, boolean>>({});
  const isSuperAdminRef = useRef(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  // Mark as mounted (client-side only)
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ── Keyboard shortcuts: Ctrl+K + Alt+letter navigation ─────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K → open command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }

      // Skip shortcuts when typing in inputs
      if (isInputFocused()) return;

      // Alt+letter shortcuts → direct navigation
      const shortcutKey = parseKeyboardEvent(e);
      if (shortcutKey && KEYBOARD_SHORTCUTS[shortcutKey]) {
        const shortcut = KEYBOARD_SHORTCUTS[shortcutKey];
        // Check permission before navigating
        if (isSuperAdminRef.current || !shortcut.permission ||
            shortcut.permission === 'view_dashboard' ||
            shortcut.permission === 'view_profile' ||
            permissionsRef.current[shortcut.permission]) {
          e.preventDefault();
          router.push(shortcut.path);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, router]);

  // ── Track page visits on route changes ──────────────────────────────────
  useEffect(() => {
    if (!pathname || !hasMounted) return;

    // Defer to avoid blocking render
    const timer = setTimeout(() => {
      try {
        const page = getPageByPath(pathname);
        if (page) {
          trackPageVisit({
            path: page.path,
            title: page.title,
            module: page.module,
            iconName: page.iconName,
          });
        }
      } catch {
        // Registry not ready yet — ignore
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [pathname, hasMounted]);

  // ── Navigate to page from command palette ───────────────────────────────
  const navigateTo = useCallback(
    (path: string) => {
      close();

      let resolvedPath = path;

      // Resolve marathon [id] placeholder from current URL or redirect to listing
      if (path.includes('/events/marathon/[id]/')) {
        const marathonMatch = pathname.match(/\/events\/marathon\/([^/]+)/);
        if (marathonMatch?.[1]) {
          resolvedPath = path.replace('[id]', marathonMatch[1]);
        } else {
          // Not on a marathon page — go to marathon listing so user can pick an event
          resolvedPath = '/events/marathon';
        }
      }

      // Defer navigation to avoid race condition with Dialog unmount
      // aborting the RSC payload fetch in Next.js 16
      requestAnimationFrame(() => {
        router.push(resolvedPath);
      });
    },
    [close, router, pathname]
  );

  // Callback for modal to update permission refs (avoids hook in provider)
  const onPermissionsLoaded = useCallback(
    (perms: Record<string, boolean>, superAdmin: boolean) => {
      permissionsRef.current = perms;
      isSuperAdminRef.current = superAdmin;
    },
    []
  );

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      {hasMounted && (
        <Suspense fallback={null}>
          <CommandPaletteModal
            isOpen={isOpen}
            onClose={close}
            onNavigate={navigateTo}
            onPermissionsLoaded={onPermissionsLoaded}
          />
        </Suspense>
      )}
    </CommandPaletteContext.Provider>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    (el as HTMLElement).isContentEditable;
}
