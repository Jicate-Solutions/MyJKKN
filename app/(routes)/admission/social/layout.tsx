/**
 * Admin / Social Media — layout wrapper.
 * Mirrors the pattern used by sibling admin sections (no extra chrome needed;
 * the root admin layout already handles nav/sidebar).
 */

export default function SocialAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
