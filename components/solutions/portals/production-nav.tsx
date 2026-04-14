'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ListTodo,
  FileStack,
  DollarSign,
  LogOut,
  ArrowLeft,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

const navigation = [
  { name: 'Dashboard', href: '/talent/production', icon: LayoutDashboard },
  { name: 'Available Work', href: '/talent/production/queue', icon: ListTodo },
  { name: 'My Work', href: '/talent/production/my-work', icon: FileStack },
  { name: 'Earnings', href: '/talent/production/earnings', icon: DollarSign },
];

interface ProductionNavProps {
  learnerName: string;
  division: string;
  skillLevel: string;
}

export function ProductionNav({ learnerName, division, skillLevel }: ProductionNavProps) {
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
        <Link href="/talent/production" className="flex items-center gap-2">
          <Palette className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-sidebar-foreground">
            Production Portal
          </span>
        </Link>
      </div>

      {/* Learner Info */}
      <div className="px-6 py-4 border-b border-sidebar-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Logged in as</p>
        <p className="text-sm font-medium text-sidebar-foreground truncate">{learnerName}</p>
        <div className="flex gap-2 mt-2">
          <Badge variant="secondary">{division}</Badge>
          <Badge variant="outline">{skillLevel}</Badge>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/talent/production' && pathname?.startsWith(item.href));
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
        <div className="rounded-lg border bg-background p-4 mb-4">
          <h3 className="font-medium text-sm">Need Help?</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Contact the production council for support.
          </p>
        </div>
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
