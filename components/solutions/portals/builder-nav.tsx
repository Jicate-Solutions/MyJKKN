'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderKanban,
  Hammer,
  Wrench,
  Wallet,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

const navigation = [
  { name: 'Overview', href: '/talent/builder', icon: LayoutDashboard },
  { name: 'My Assignments', href: '/talent/builder/assignments', icon: FolderKanban },
  { name: 'Available Phases', href: '/talent/builder/available', icon: Hammer },
  { name: 'My Skills', href: '/talent/builder/skills', icon: Wrench },
  { name: 'My Earnings', href: '/talent/builder/earnings', icon: Wallet },
];

interface BuilderNavProps {
  builderName: string;
}

export function BuilderNav({ builderName }: BuilderNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <Link href="/talent/builder" className="flex items-center gap-2">
          <Hammer className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-sidebar-foreground">
            Builder Portal
          </span>
        </Link>
      </div>

      {/* Builder Name */}
      <div className="px-6 py-4 border-b border-sidebar-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Logged in as</p>
        <p className="text-sm font-medium text-sidebar-foreground truncate">{builderName}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/talent/builder' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4">
        <Separator className="mb-4" />
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Main Hub
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
