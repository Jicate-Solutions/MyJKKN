/**
 * Form Skeleton Component
 *
 * Loading skeleton for forms while data is being fetched.
 * Used for edit forms that need to load initial data.
 */

import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';

interface FormSkeletonProps {
  /**
   * Number of form fields to show
   * @default 6
   */
  fields?: number;
  /**
   * Show card wrapper
   * @default true
   */
  showCard?: boolean;
}

export function FormSkeleton({
  fields = 6,
  showCard = true
}: FormSkeletonProps = {}) {
  const content = (
    <div className="space-y-6">
      {/* Form title */}
      <Skeleton className="h-6 w-48" />

      {/* Form fields */}
      <div className="space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>

      {/* Form actions */}
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );

  if (!showCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-6 w-64" />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

/**
 * Inline Form Skeleton
 *
 * Smaller form skeleton without card wrapper
 */
export function InlineFormSkeleton() {
  return <FormSkeleton fields={4} showCard={false} />;
}
