/**
 * Public documents layout — bypasses AuthProvider.
 * Used for document verification pages that need to work without login.
 */
export default function DocumentsPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
