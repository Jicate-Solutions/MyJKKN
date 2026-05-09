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
          isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72',
          // Add bottom padding on mobile to prevent content overlap with bottom nav
          isMobile && 'pb-20'
        )}
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
