'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  CalendarCheck,
  Wallet,
  Award,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

const navigation = [
  { name: 'Overview', href: '/talent/cohort', icon: LayoutDashboard },
  { name: 'Available Sessions', href: '/talent/cohort/sessions', icon: Calendar },
  { name: 'My Schedule', href: '/talent/cohort/schedule', icon: CalendarCheck },
  { name: 'Level Progress', href: '/talent/cohort/level', icon: Award },
  { name: 'My Earnings', href: '/talent/cohort/earnings', icon: Wallet },
];

interface CohortNavProps {
  memberName: string;
  memberId: string;
  level: number;
}

export function CohortNav({ memberName, memberId, level }: CohortNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const levelLabels: Record<number, string> = {
    0: 'Observer',
    1: 'Co-Lead',
    2: 'Lead',
    3: 'Master',
  };

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <Link href="/talent/cohort" className="flex items-center gap-2">
          <Award className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-sidebar-foreground">
            Cohort Portal
          </span>
        </Link>
      </div>

      {/* Member Info */}
      <div className="px-6 py-4 border-b border-sidebar-border">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Logged in as</p>
        <p className="text-sm font-medium text-sidebar-foreground truncate">{memberName}</p>
        <Badge variant="secondary" className="mt-2">
          Level {level}: {levelLabels[level] || 'Unknown'}
        </Badge>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/talent/cohort' && pathname?.startsWith(item.href));
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
