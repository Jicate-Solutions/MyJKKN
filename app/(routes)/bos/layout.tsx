'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Users, ClipboardList, CalendarDays, Receipt, BarChart3, BookOpen, Layers, BookText, ListTree } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const BOS_NAV_TABS = [
  { href: '/bos/taxonomy',      label: 'Taxonomy',         icon: Layers },
  { href: '/bos/courses',       label: 'Courses',          icon: BookText },
  { href: '/bos/course-scheme', label: 'Course Scheme',    icon: ListTree },
  { href: '/bos/experts',       label: 'External Experts', icon: Users },
  { href: '/bos/compositions',  label: 'Compositions',     icon: ClipboardList },
  { href: '/bos/syllabi',       label: 'Syllabi',          icon: BookOpen },
  { href: '/bos/meetings',      label: 'Meetings',         icon: CalendarDays },
  { href: '/bos/ta-da',         label: 'TA/DA Claims',     icon: Receipt },
  { href: '/bos/reports',       label: 'Reports',          icon: BarChart3 },
];

// Per-tab leaf labels for sub-routes.
// `null` means "no extra leaf" (we're on the listing itself).
function resolveSubLeaf(tabHref: string, pathname: string): string | null {
  const tail = pathname.slice(tabHref.length); // e.g. '', '/new', '/<id>/edit', '/<id>'

  if (tail === '' || tail === '/') return null;

  if (tail === '/new') {
    if (tabHref === '/bos/syllabi') return 'New Syllabus';
    if (tabHref === '/bos/experts') return 'Add Expert';
    if (tabHref === '/bos/compositions') return 'New Composition';
    if (tabHref === '/bos/meetings') return 'Schedule Meeting';
    if (tabHref === '/bos/courses') return 'New Course';
    if (tabHref === '/bos/taxonomy') return null;
    return 'New';
  }

  if (tail.endsWith('/edit')) {
    if (tabHref === '/bos/syllabi') return 'Edit Syllabus';
    if (tabHref === '/bos/experts') return 'Edit Expert';
    if (tabHref === '/bos/compositions') return 'Edit Composition';
    if (tabHref === '/bos/meetings') return 'Edit Meeting';
    if (tabHref === '/bos/courses') return 'Edit Course';
    return 'Edit';
  }

  if (tail.endsWith('/history')) {
    if (tabHref === '/bos/syllabi') return 'Syllabus History';
    return 'History';
  }

  // Taxonomy regulation detail: '/<regulationId>'
  if (tabHref === '/bos/taxonomy') return 'Manage Taxonomy';

  // Detail page: '/<id>'
  if (tabHref === '/bos/compositions') return 'Composition Details';
  if (tabHref === '/bos/meetings') return 'Meeting Details';
  return 'Details';
}

function resolveActiveTab(pathname: string) {
  return BOS_NAV_TABS.find((tab) => pathname.startsWith(tab.href)) ?? null;
}

export default function BoSLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeTab = resolveActiveTab(pathname);
  const subLeaf = activeTab ? resolveSubLeaf(activeTab.href, pathname) : null;

  const pageTitle = activeTab
    ? subLeaf
      ? `Board of Studies - ${subLeaf}`
      : `Board of Studies - ${activeTab.label}`
    : 'Board of Studies';

  return (
    <ContentLayout title={pageTitle}>
      {/* ── Breadcrumb: Dashboard > Academic > Board of Studies > [tab] > [sub] ── */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/dashboard'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {activeTab ? (
              <BreadcrumbLink href='/bos'>Board of Studies</BreadcrumbLink>
            ) : (
              <BreadcrumbPage>Board of Studies</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {activeTab && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {subLeaf ? (
                  <BreadcrumbLink href={activeTab.href}>{activeTab.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{activeTab.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </>
          )}
          {activeTab && subLeaf && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{subLeaf}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {/* ── BoS sub-navigation tabs ─────────────────────────────────────── */}
      <div className='border-b bg-background -mx-4 sm:-mx-8 mt-4'>
        <nav className='flex overflow-x-auto px-4 sm:px-8 -mb-px gap-1'>
          {BOS_NAV_TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                )}
              >
                <Icon className='h-4 w-4' />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className='pt-4'>{children}</div>
    </ContentLayout>
  );
}
