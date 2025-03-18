'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { CategoryForm } from '../_components/category-form';

export default function NewDigitalResourceCategoryPage() {
  return (
    <ContentLayout title="Add Digital Resource Category">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/resources/digital-resources">Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/resources/digital-resources/categories">Categories</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Add New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Add New Category</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Create a new digital resource category
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            asChild
            className="flex items-center"
          >
            <Link href="/resources/digital-resources/categories">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Categories
            </Link>
          </Button>
        </div>
        
        <Card>
          <CardContent className="p-6">
            <CategoryForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
