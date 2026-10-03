'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { Button } from '@/components/ui/button';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverRequirementService } from '@/lib/services/instasolver/requirement-service';
import type { CreateRequirementDto } from '@/types/instasolver';
import { RequirementForm } from '../_components/requirement-form';

export default function NewRequirementPage() {
  const router = useRouter();
  const create = useInstaSolverMutation(
    (dto: CreateRequirementDto) => InstaSolverRequirementService.create(dto),
    (created) => `Request ${created.reference_no} sent to the CAO for review`
  );

  return (
    <AccessGate need="report">
      <div className="space-y-4">
        <PageBreadcrumb
          items={[
            { label: 'InstaSolver', href: '/instasolver/dashboard' },
            { label: 'Requirements', href: '/instasolver/requirements' },
            { label: 'Request an item', isCurrent: true }
          ]}
        />
        <PageHeader
          title="Request an item"
          description="Tell the CAO what is needed and where. You can edit or withdraw the request until it is reviewed."
          actions={
            <Button asChild variant="outline">
              <Link href="/instasolver/requirements">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to requirements
              </Link>
            </Button>
          }
        />
        <RequirementForm
          submitLabel="Submit request"
          submitting={create.isPending}
          onSubmit={(dto) =>
            create.mutate(dto, {
              onSuccess: (created) => router.push(`/instasolver/requirements/${created.id}`)
            })
          }
          onCancel={() => router.push('/instasolver/requirements')}
        />
      </div>
    </AccessGate>
  );
}
