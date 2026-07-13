// app/(routes)/reference/[catalog]/page.tsx
// Server wrapper for the generic catalog browser. Unwraps async params /
// searchParams here so the client component never needs useSearchParams
// (bare useSearchParams is a deploy-blocker in MyJKKN — must be Suspense-wrapped).

import { ReferenceCatalogBrowser } from './_components/reference-catalog-browser';

export default async function ReferenceCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalog: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { catalog } = await params;
  const sp = await searchParams;
  return (
    <ReferenceCatalogBrowser catalogKey={catalog} initialOpenNew={sp?.new === '1'} />
  );
}
