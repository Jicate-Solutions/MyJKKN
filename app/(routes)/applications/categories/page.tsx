// app/(routes)/applications/categories/page.tsx
import { Suspense } from 'react';
import Categories from './_components/categories';
import { LoadingState } from './_components/loading-state';

export const revalidate = 0; // Disable cache

export default async function CategoriesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Categories />
    </Suspense>
  );
}
