'use client';

/**
 * AdminModuleNav — Tier 2 in-page tab strip for `/admin/*`.
 *
 * Renders one chip per top-level admin category (Notifications, PDE, LTI,
 * Counselors, System). The active chip is computed from `usePathname()` via
 * `findActiveCategory()` from `lib/admin/nav-tree.ts`.
 *
 * Auto-discovery
 * --------------
 * Categories come from the filesystem-derived nav tree — drop a new
 * `app/(routes)/admin/<x>/page.tsx` and (after `npm run gen:routes` or build)
 * the new tab appears with zero registration.
 *
 * Visual style mirrors the canonical in-page tab pattern from
 * `components/navigation/section-subnav.tsx` so admin feels consistent with
 * Learners Council, Campus Living, Admission Counselors Team, etc.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { findActiveCategory } from '@/lib/admin/nav-tree';
import { useAdminNavTree } from '@/hooks/admin/use-admin-nav-tree';

function getIcon(iconName: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon>)[iconName];
  return icon ?? Icons.ShieldCheck;
}

interface AdminModuleNavProps {
  className?: string;
}

export function AdminModuleNav({ className }: AdminModuleNavProps) {
  const pathname = usePathname();
  const tree = useAdminNavTree();
  const active = pathname ? findActiveCategory(pathname) : null;
  const activeKey = active?.category.key ?? null;

  if (tree.length === 0) return null;

  return (
    <nav
      aria-label="Admin module tabs"
      className={cn(
        // Match section-subnav.tsx visual: pill strip with subtle background
        'flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border max-w-full',
        className
      )}
    >
      {tree.map((category) => {
        const Icon = getIcon(category.iconName);
        const isActive = category.key === activeKey;
        return (
          <Link
            key={category.key}
            href={category.href}
            data-admin-category={category.key}
            data-active={isActive ? 'true' : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap',
              isActive
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {category.label}
          </Link>
        );
      })}
    </nav>
  );
}
