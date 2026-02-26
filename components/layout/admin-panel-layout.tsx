'use client';

import { cn } from '@/lib/utils';
import { useStore } from '@/hooks/use-store';
import { useSidebarToggle } from '@/hooks/use-sidebar-toggle';
import { useIsMobile } from '@/hooks/use-mobile';
import Sidebar from '@/components/Sidebar/Sidebar';
import { Footer } from '@/components/Footer/Footer';
import { BottomNavbar } from '@/components/BottomNav';

export default function AdminPanelLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const sidebar = useStore(useSidebarToggle, (state) => state);
  const isMobile = useIsMobile();

  // Show loading state while Zustand store hydrates (prevents blank page)
  if (!sidebar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <main
        className={cn(
          'min-h-[calc(100vh_-_56px)] bg-background transition-[margin-left] ease-in-out duration-300',
          sidebar?.isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72',
          // Add bottom padding on mobile to prevent content overlap with bottom nav
          isMobile && 'pb-20'
        )}
      >
        {children}
      </main>
      <footer
        className={cn(
          'transition-[margin-left] ease-in-out duration-300',
          sidebar?.isOpen === false ? 'lg:ml-[90px]' : 'lg:ml-72',
          // Hide footer on mobile when bottom nav is present
          isMobile && 'hidden'
        )}
      >
        <Footer />
      </footer>
      {/* Bottom Navigation for mobile */}
      <BottomNavbar />
    </>
  );
}
