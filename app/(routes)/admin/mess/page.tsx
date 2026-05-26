'use client';

// ============================================================================
// /admin/mess — Mess Menu hub page
// ============================================================================
// Director-facing landing page for the Mess Menu module. Per
// `reference_hub_page_404_class.md`: every Next.js App Router directory with
// children but no page.tsx returns 404 after auth — this prevents that here.
//
// Four entry points:
//   1. Menu Editor    → /admin/mess/menu/standard (defaults to standard tier)
//   2. Caterers       → /admin/mess/caterers
//   3. Item Library   → /admin/mess/library (built in PR #1094)
//   4. Policies       → /admin/mess/policies
//
// Pattern source: /admin/internship-policy/page.tsx (hub with 6 category
// cards). Slimmed to 4 cards for mess.
// ============================================================================

import Link from 'next/link';
import {
  BookOpen,
  CalendarRange,
  ChefHat,
  ChevronRight,
  Settings,
  Utensils,
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

export const navMeta = { label: 'Mess Menu', icon: 'Utensils' } as const;

interface HubCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
}

const CARDS: HubCard[] = [
  {
    href: '/admin/mess/menu/standard',
    title: 'Weekly Menu Editor',
    description:
      'Edit the 7-day × 4-meal grid per tier. Pick items from the library or type Tamil/English directly. 2-hour mid-week edit cutoff applies.',
    icon: CalendarRange,
    accent: 'text-blue-600',
  },
  {
    href: '/admin/mess/caterers',
    title: 'Caterers',
    description:
      'List, rename, or add caterers. Set gender_served (boys / girls / both) so the right caterer is dispatched per resident.',
    icon: ChefHat,
    accent: 'text-orange-600',
  },
  {
    href: '/admin/mess/library',
    title: 'Item Library',
    description:
      'Browse and audit the 330+ catalogue items. Native-Tamil-review queue, soft-delete, popularity stats.',
    icon: BookOpen,
    accent: 'text-emerald-600',
  },
  {
    href: '/admin/mess/policies',
    title: 'Policies',
    description:
      'Tune the 6 runtime knobs (edit cutoff, fee model, source locale, tier-crossing, image source, seed size).',
    icon: Settings,
    accent: 'text-purple-600',
  },
];

export default function MessAdminHubPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. The Mess Menu
            module governs hostel-wide bilingual menus and per-tier pricing.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex items-center gap-3">
          <Utensils className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mess Menu</h1>
            <p className="text-sm text-muted-foreground">
              Director-only hub for the hostel mess module. All edits are audited.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
          {CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.href} href={c.href} className="block group">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div className="flex items-start gap-3">
                      <Icon className={`h-6 w-6 mt-0.5 ${c.accent}`} />
                      <div>
                        <CardTitle className="text-lg">{c.title}</CardTitle>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed">
                      {c.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
