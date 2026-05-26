'use client';

// ============================================================================
// /admin/hostel — Hostel admin hub page
// ============================================================================
// Director-facing landing page for the Hostel admin module. Per
// `reference_hub_page_404_class.md`: every Next.js App Router directory with
// children but no page.tsx returns 404 after auth — this prevents that for
// /admin/hostel now that allocation-rules + curfew live underneath it.
//
// Pattern source: /admin/mess/page.tsx (4-card grid, SuperAdminOnly guard).
// Rooms and Allocations cards are placeholders until the rooms-v2 stack ships.
// ============================================================================

import Link from 'next/link';
import {
  BedDouble,
  ChevronRight,
  Clock,
  Construction,
  Home,
  Settings2,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const navMeta = { label: 'Hostel', icon: 'Home' } as const;

interface HubCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  comingSoon?: boolean;
}

const CARDS: HubCard[] = [
  {
    href: '/admin/hostel/curfew',
    title: 'Curfew Policies',
    description:
      'Strictest-wins entry / exit curfew rules across institution × gender × day-of-week × direction. Live resolver preview included.',
    icon: Clock,
    accent: 'text-amber-600',
  },
  {
    href: '/admin/hostel/allocation-rules',
    title: 'Allocation Rules',
    description:
      'Premium-stay knobs: invite expiry, hold window, retries, payment mode, per-block premium quota, premium-plus late-returns quota.',
    icon: Settings2,
    accent: 'text-purple-600',
  },
  {
    href: '/admin/hostel/rooms',
    title: 'Rooms',
    description:
      'Room catalog with capacity, block / floor, AC and tier metadata. College-access junction is managed per room.',
    icon: BedDouble,
    accent: 'text-blue-600',
  },
  {
    href: '/admin/hostel/allocations',
    title: 'Allocations',
    description:
      'Allocate residents to specific rooms / beds, snapshot fee at allocation time, track active vs checked-out. (Building — separate PR.)',
    icon: Home,
    accent: 'text-emerald-600',
    comingSoon: true,
  },
];

export default function HostelAdminHubPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. The Hostel admin
            module governs curfew, premium-stay allocation rules, room catalog,
            and resident allocations across the campus living portfolio.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex items-center gap-3">
          <Home className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hostel</h1>
            <p className="text-sm text-muted-foreground">
              Director-only hub. Curfew rules and premium-stay allocation knobs
              are live; rooms / allocations admin ships separately.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
          {CARDS.map((c) => {
            const Icon = c.icon;
            const isComingSoon = Boolean(c.comingSoon);

            const inner = (
              <Card
                className={
                  isComingSoon
                    ? 'h-full opacity-60'
                    : 'h-full transition-shadow hover:shadow-md'
                }
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-6 w-6 mt-0.5 ${c.accent}`} />
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {c.title}
                        {isComingSoon && (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            <Construction className="mr-1 h-3 w-3" />
                            Building
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                  </div>
                  {!isComingSoon && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {c.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );

            return isComingSoon ? (
              <div key={c.href} aria-disabled="true">
                {inner}
              </div>
            ) : (
              <Link key={c.href} href={c.href} className="block group">
                {inner}
              </Link>
            );
          })}
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
