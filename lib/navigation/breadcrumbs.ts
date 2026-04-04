import { getPageByPath, getPageRegistry } from './page-registry';
import type { PageEntry } from './types';

export interface BreadcrumbItem {
  title: string;
  path: string;
  isCurrentPage: boolean;
}

/**
 * Generate breadcrumb trail from pathname.
 * Walks up the path hierarchy looking for matching pages in the registry.
 *
 * Example: '/academic/attendance/reports'
 * → [{ title: 'Dashboard', path: '/' }, { title: 'Attendance', path: '/academic/attendance' }, { title: 'Reports', path: '/academic/attendance/reports' }]
 */
export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  if (!pathname || pathname === '/') {
    return [{ title: 'Dashboard', path: '/', isCurrentPage: true }];
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', path: '/', isCurrentPage: false },
  ];

  // Split path and build cumulative segments
  const segments = pathname.split('/').filter(Boolean);
  let cumulativePath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Skip UUID segments — they're dynamic route params
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(segment)) continue;

    cumulativePath += `/${segment}`;
    const isLast = i === segments.length - 1;

    // Try to find this path in the registry
    const page = getPageByPath(cumulativePath);

    if (page) {
      breadcrumbs.push({
        title: page.title,
        path: page.path,
        isCurrentPage: isLast,
      });
    } else {
      // No registry match — create a breadcrumb from the segment name
      // Only add if this is meaningful (not a short generic segment like 'new', 'edit')
      if (segment.length > 3 && !['new', 'edit'].includes(segment)) {
        const title = segment
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        breadcrumbs.push({
          title,
          path: cumulativePath,
          isCurrentPage: isLast,
        });
      }
    }
  }

  return breadcrumbs;
}

/**
 * Get sibling pages at the same hierarchy level.
 * Useful for showing a dropdown of alternative pages at a breadcrumb level.
 */
export function getSiblingPages(path: string): PageEntry[] {
  const parentPath = path.split('/').slice(0, -1).join('/');
  if (!parentPath) return [];

  return getPageRegistry().filter(page => {
    const pageParent = page.path.split('/').slice(0, -1).join('/');
    return pageParent === parentPath && page.path !== path;
  });
}
