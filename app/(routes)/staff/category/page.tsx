import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { getStaffCategories } from './_data/get-staff-categories';
import { staffCategoriesSearchParamsSchema } from './_components/data-table-schema';
import { CategoryPageClient } from './_components/category-page-client';

interface CategoriesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const params = await searchParams;
  const search = staffCategoriesSearchParamsSchema.parse(params);

  // Fetch categories server-side with caching
  const categoriesData = await getStaffCategories({
    search: search.search,
    isActive: search.isActive,
    page: search.page,
    pageSize: search.pageSize
  });

  const metadata = {
    total: categoriesData.total,
    page: categoriesData.page,
    limit: categoriesData.pageSize,
    totalPages: Math.ceil(categoriesData.total / categoriesData.pageSize)
  };

  return (
    <ContentLayout title='Staff Categories'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/dashboard'>Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/staff'>Staff</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categories</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <CategoryPageClient
        categories={categoriesData.data}
        metadata={metadata}
        searchParams={search}
      />
    </ContentLayout>
  );
}
