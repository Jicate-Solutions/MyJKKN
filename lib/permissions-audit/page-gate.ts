import { routeMatcher } from '@/lib/auth/route-matcher';
import { isSentinelPermission } from '@/lib/navigation/permission-filter';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import type { PageGate } from '@/types/permissions-audit';

/**
 * What gates one URL.
 *
 * Shared by the build-time extractor (scripts/generate-page-access-map.ts) and
 * the request-time API (app/api/users/permissions-audit/page-access/route.ts)
 * so a page's stored gate and a tab's resolved gate can never be computed by
 * two slightly different rules — the whole lens is a claim about consistency,
 * and it would be embarrassing for it to be internally inconsistent.
 *
 * `guardedPrefixes` is the set of URL prefixes whose layout.tsx wraps the
 * subtree in <RoutePermissionGuard>. Only the extractor can discover that (it
 * needs the filesystem), so it stores the list and the API passes it back in.
 */
export function resolvePageGate(
  url: string,
  guardedPrefixes: Iterable<string>
): PageGate {
  const matched = routeMatcher.match(url);
  const permission = matched?.permission ?? null;

  let enforcedByLayout = false;
  for (const prefix of guardedPrefixes) {
    if (url === prefix || url.startsWith(prefix === '/' ? '/' : `${prefix}/`)) {
      enforcedByLayout = true;
      break;
    }
  }

  return {
    permission,
    // 'direct' means the URL has its OWN MENU_PERMISSIONS entry; 'inherited'
    // means routeMatcher fell back to an ancestor's. Both are real gates — the
    // distinction matters because moving or renaming the ancestor silently
    // changes what gates the descendant.
    source: permission
      ? Object.prototype.hasOwnProperty.call(MENU_PERMISSIONS, url)
        ? 'direct'
        : 'inherited'
      : 'ungated',
    matchedPath: matched?.matchedPath ?? null,
    isSentinel: permission ? isSentinelPermission(permission) : false,
    enforcedByLayout,
  };
}
