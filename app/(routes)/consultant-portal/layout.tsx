// app/(routes)/consultant-portal/layout.tsx
// Layout for Consultant Portal - Self-service area for consultants
//
// Engine port (2026-05-13):
//   - Fix 1+2: replaces broken `limit:1 + .find(c => c.referrer_user_id === profile.id)`
//     antipattern with a direct user_id-filtered Supabase query. The previous code
//     only worked when YOUR consultant row happened to be the first returned.
//   - Fix 5: wires canAccessConsultantPortal() from
//     consultant-portal-access-service so preview-as / config-driven allowlist
//     entries can enter the portal even without an active consultant record.
//     Renders an admin banner when entry is via preview_as_consultant.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  canAccessConsultantPortal,
  type PortalAccessCheckResult,
} from '@/lib/services/admission/consultant-portal-access-service';
import type { EducationConsultant } from '@/types/education-consultants';
import {
  LayoutDashboard,
  UserPlus,
  IndianRupee,
  User,
  ChevronLeft,
  Building2,
  ShieldAlert,
} from 'lucide-react';

const portalNavItems = [
  {
    title: 'Dashboard',
    href: '/consultant-portal',
    icon: LayoutDashboard,
  },
  {
    title: 'Submit Lead',
    href: '/consultant-portal/leads/submit',
    icon: UserPlus,
  },
  {
    title: 'My Leads',
    href: '/consultant-portal/leads',
    icon: Building2,
  },
  {
    title: 'Commissions',
    href: '/consultant-portal/commissions',
    icon: IndianRupee,
  },
  {
    title: 'Profile',
    href: '/consultant-portal/profile',
    icon: User,
  },
];

export default function ConsultantPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [accessCheck, setAccessCheck] = useState<PortalAccessCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load consultant data by user_id (Fix 1+2: direct query, no scan-and-find).
  // Falls back to canAccessConsultantPortal allowlist (Fix 5) when no consultant
  // row is linked — covers preview-as and config-driven access principals.
  useEffect(() => {
    async function loadConsultant() {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createClientSupabaseClient() as any;
        const { data: myConsultant, error: lookupError } = await supabase
          .from('education_consultants')
          .select('*')
          .eq('user_id', profile.id)
          .eq('status', 'active')
          .maybeSingle();

        if (lookupError) {
          throw new Error(lookupError.message || 'Failed to load profile');
        }

        if (myConsultant) {
          setConsultant(myConsultant as EducationConsultant);
          setAccessCheck({
            allowed: true,
            via: 'consultant_record',
            matched_rule_id: null,
          });
          return;
        }

        // No consultant row — check config-driven allowlist (super_admin,
        // preview-as, named principals). canAccessConsultantPortal handles
        // the super_admin short-circuit and falls back gracefully.
        const check = await canAccessConsultantPortal(profile.id);
        setAccessCheck(check);
        if (!check.allowed) {
          setError('No consultant profile found for your account');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setIsLoading(false);
      }
    }

    if (!authLoading && profile) {
      loadConsultant();
    }
  }, [profile, authLoading]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex">
          {/* Sidebar skeleton */}
          <div className="hidden md:flex md:w-64 md:flex-col border-r">
            <div className="flex flex-col h-full p-4">
              <Skeleton className="h-8 w-32 mb-8" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>
          {/* Content skeleton */}
          <div className="flex-1 p-6">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Access denied: no consultant row AND not on allowlist.
  if (error && !accessCheck?.allowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md mx-auto p-6">
          <div className="p-4 rounded-full bg-destructive/10 w-fit mx-auto">
            <User className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">
            {error || 'You do not have a consultant profile linked to your account.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact the admissions team to set up your consultant account.
          </p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Allowlisted entry without a consultant row (super_admin / preview-as /
  // named principal). Render a minimal shell with an admin banner.
  const isAdminPreview = !consultant && !!accessCheck?.allowed;

  return (
    <div className="min-h-screen bg-background">
      {isAdminPreview && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <ShieldAlert className="h-4 w-4" />
            <span>
              Admin preview mode (via {accessCheck?.via ?? 'allowlist'}). You
              are viewing the consultant portal without a linked consultant
              record.
            </span>
          </div>
        </div>
      )}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col border-r min-h-screen">
          <div className="flex flex-col h-full p-4">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-primary">Consultant Portal</h2>
              <p className="text-sm text-muted-foreground truncate">
                {consultant?.name ?? profile?.full_name ?? 'Admin'}
              </p>
              {consultant?.tier && (
                <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                  {consultant.tier} Tier
                </div>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
              {portalNavItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/consultant-portal' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="border-t pt-4 mt-4 space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => router.push('/dashboard')}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Main App
              </Button>
            </div>
          </div>
        </aside>

        {/* Mobile header */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Consultant Portal</h2>
              <p className="text-xs text-muted-foreground">
                {consultant?.name ?? profile?.full_name ?? 'Admin'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          {/* Mobile nav */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
            {portalNavItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/consultant-portal' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <item.icon className="h-3 w-3" />
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 md:p-6 p-4 pt-32 md:pt-6 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
