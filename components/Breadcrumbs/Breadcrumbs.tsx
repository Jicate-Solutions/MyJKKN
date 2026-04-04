'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { generateBreadcrumbs } from '@/lib/navigation/breadcrumbs';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Breadcrumb navigation bar showing the current page hierarchy.
 * Truncates on mobile to show only last 2 segments.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const breadcrumbs = useMemo(() => generateBreadcrumbs(pathname), [pathname]);

  // Don't show breadcrumbs on dashboard (it's the root)
  if (pathname === '/' || pathname === '/dashboard' || breadcrumbs.length <= 1) {
    return null;
  }

  // On mobile, show truncated breadcrumbs (... > Parent > Current)
  const displayBreadcrumbs = isMobile && breadcrumbs.length > 2
    ? [{ title: '...', path: '', isCurrentPage: false }, ...breadcrumbs.slice(-2)]
    : breadcrumbs;

  return (
    <nav
      aria-label="Breadcrumb"
      className="px-4 sm:px-6 py-2 border-b border-border/30 dark:border-gray-800/50 bg-background/80 backdrop-blur-sm"
    >
      <ol className="flex items-center gap-1 text-sm">
        {displayBreadcrumbs.map((crumb, index) => {
          const isFirst = index === 0 && crumb.title !== '...';
          const isLast = crumb.isCurrentPage;
          const isEllipsis = crumb.title === '...';

          return (
            <li key={crumb.path || index} className="flex items-center gap-1">
              {/* Separator */}
              {index > 0 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              )}

              {/* Breadcrumb item */}
              {isEllipsis ? (
                <span className="text-muted-foreground/50">...</span>
              ) : isLast ? (
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {crumb.title}
                </span>
              ) : (
                <Link
                  href={crumb.path}
                  className={cn(
                    'text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]',
                    'dark:text-gray-400 dark:hover:text-gray-200'
                  )}
                >
                  {isFirst ? (
                    <span className="flex items-center gap-1">
                      <Home className="h-3 w-3" />
                      <span className="hidden sm:inline">{crumb.title}</span>
                    </span>
                  ) : (
                    crumb.title
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
