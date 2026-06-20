'use client';

/** Parent Portal — "More" / hamburger drawer (navigation + theme + logout). */
import { useRouter } from 'next/navigation';
import {
  Home,
  User,
  UserPlus,
  Bell,
  Info,
  Sparkles,
  LifeBuoy,
  Phone,
  Palette,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { useParentSession } from '@/hooks/parent/use-parent-session';

interface Item {
  label: string;
  icon: LucideIcon;
  href?: string;
  action?: 'theme' | 'logout';
  comingSoon?: boolean;
}

export function ParentMoreDrawer({
  open,
  onOpenChange,
  onOpenTheme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTheme: () => void;
}) {
  const router = useRouter();
  const { logout, activeChild } = useParentSession();

  const items: Item[] = [
    { label: 'Home', icon: Home, href: '/parent/dashboard' },
    { label: 'Profile', icon: User, href: '/parent/profile' },
    { label: 'Add Sibling', icon: UserPlus, href: '/parent/add-sibling' },
    { label: 'Notifications', icon: Bell, href: '/parent/notifications' },
    { label: 'About Us', icon: Info, href: '/parent/about' },
    { label: 'Spotlight', icon: Sparkles, href: '/parent/spotlight' },
    { label: 'Help & Feedback', icon: LifeBuoy, href: '/parent/help' },
    { label: 'Contact Us', icon: Phone, href: '/parent/contact' },
    { label: 'Settings', icon: Settings, href: '/parent/settings' },
    { label: 'Theme', icon: Palette, action: 'theme' },
    { label: 'Logout', icon: LogOut, action: 'logout' },
  ];

  const handle = (item: Item) => {
    if (item.comingSoon) {
      toast.info(`${item.label} is coming soon`);
      return;
    }
    onOpenChange(false);
    if (item.href) router.push(item.href);
    else if (item.action === 'theme') onOpenTheme();
    else if (item.action === 'logout') void logout();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* The drawer portals to <body>, so it escapes the shell's max-w-md
          mobile column and would otherwise stretch full desktop width. Cap +
          center it to match the shell (ParentShell uses the same max-w-md). */}
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="text-left">
          <DrawerTitle>{activeChild?.fullName ?? 'Menu'}</DrawerTitle>
          {activeChild?.admissionNumber && (
            <p className="text-xs text-muted-foreground">{activeChild.admissionNumber}</p>
          )}
        </DrawerHeader>
        <div className="grid gap-1 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {items.map((item) => {
            const Icon = item.icon;
            const danger = item.action === 'logout';
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handle(item)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                  danger ? 'text-red-600' : ''
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
