// Pure prefix-exemption test for RoutePermissionGuard. Kept dependency-free
// (no React/Supabase) so it is unit-testable in isolation.
//
//   'prefix'   -> matches the prefix page AND its descendants
//   'prefix/'  -> matches ONLY descendants (the prefix page itself stays gated;
//                 use when a parent admin page has a public child, e.g.
//                 '/audit/care/score/' frees the token participant page while
//                 keeping the scorer-setup page gated).
export function isExemptPath(pathname: string, exemptPrefixes?: string[]): boolean {
  return !!exemptPrefixes?.some((p) =>
    p.endsWith('/')
      ? pathname.startsWith(p)
      : pathname === p || pathname.startsWith(p + '/'),
  );
}
