/**
 * InstaSolver — which follow-up pages exist in THIS build.
 *
 * The chooser's "My complaints" button points at /instasolver/my-complaints,
 * a page that arrives in a separate PR (#4144). A button on the front door that
 * opens a not-found page is exactly the kind of broken promise the chooser must
 * never make (rule #27), and no gate catches a chooser <Link> to a missing page.
 *
 * So the button shows only when that page is really in the build. The check
 * reads ROUTE_MANIFEST, which `npm run build` regenerates from every page.tsx
 * under app/(routes) (`gen:routes` runs first), so it reflects the files that
 * are actually being deployed — not what somebody remembered to commit.
 *
 * Server-side only: the manifest is ~200 KB and must not ship to the browser.
 * page.tsx calls this and hands the chooser a plain boolean.
 */
import {
  ROUTE_MANIFEST,
  type RouteNode,
} from '@/lib/navigation/route-manifest.generated';

export const MY_COMPLAINTS_HREF = '/instasolver/my-complaints';

/** True when `path` is a page in the given route manifest. */
export function routeInManifest(
  path: string,
  manifest: RouteNode[] = ROUTE_MANIFEST
): boolean {
  const stack = [...manifest];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.path === path) return true;
    if (node.children?.length) stack.push(...node.children);
  }
  return false;
}

/** True when the My complaints page is part of this build. */
export function hasMyComplaintsPage(): boolean {
  return routeInManifest(MY_COMPLAINTS_HREF);
}
