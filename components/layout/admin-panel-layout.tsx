'use client';

import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/hooks/use-store';
import { useSidebarToggle } from '@/hooks/use-sidebar-toggle';
import { useIsMobile } from '@/hooks/use-mobile';
import Sidebar from '@/components/Sidebar/Sidebar';
import { Footer } from '@/components/Footer/Footer';
import { BottomNavbar } from '@/components/BottomNav';
import { PushNotificationBanner } from '@/components/notifications/push-notification-banner';
import { CommandPaletteProvider } from '@/components/CommandPalette/CommandPaletteProvider';
import { KeyboardShortcutsHelp } from '@/components/CommandPalette/KeyboardShortcutsHelp';

export default function AdminPanelLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const sidebar = useStore(useSidebarToggle, (state) => state);
  const isMobile = useIsMobile();

  // Use safe default — never return null to avoid unmounting children (destroys form state)
  const isOpen = sidebar?.isOpen ?? true;

  return (
    <CommandPaletteProvider>
      <Suspense>
        <Sidebar />
      </Suspense>
      <main
        className={cn(
          'min-h-[calc(100vh_-_56px)] bg-background transition-[margin-left] ease-in-out duration-300',
          'overflow-x-clip',
          isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72',
          // Bottom padding on mobile to clear the bottom-nav strip (~76px:
          // icons + label + safe-area). The AttentionBar pill that used to
          // stack ~58px above the nav was removed 2026-06-19, so `pb-20`
          // (80px) — which clears the nav alone — is sufficient again.
          // (Was `pb-36`/144px while the AttentionBar occupied the extra
          // space above the nav; see BUG-003930, BUG-003931.)
          isMobile && 'pb-20'
        )}
        suppressHydrationWarning
      >
        <PushNotificationBanner />
        <Suspense>
          {children}
        </Suspense>
      </main>
      <footer
        className={cn(
          'transition-[margin-left] ease-in-out duration-300',
          isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72',
          // Hide footer on mobile when bottom nav is present
          isMobile && 'hidden'
        )}
        suppressHydrationWarning
      >
        <Footer />
      </footer>
      {/* Bottom Navigation for mobile — wrapper-level lg:hidden enforces
          mobile-only rendering regardless of any descendant component's
          internal guards (defense-in-depth). Matches the convention used
          by BottomNavbar's <motion.nav> and AttentionBar's outer divs.
          Director-flagged 2026-05-08: black floating bar bled through to
          desktop /admission/dashboard view. */}
      <div className="lg:hidden">
        <Suspense>
          <BottomNavbar />
        </Suspense>
      </div>
      <KeyboardShortcutsHelp />
    </CommandPaletteProvider>
  );
}
