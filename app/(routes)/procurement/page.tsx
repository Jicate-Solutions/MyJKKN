'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, FileSearch, PackageCheck, ArrowRight } from 'lucide-react';

// Procurement pipeline stages (PRD): PR -> RFQ -> Quotation -> PO -> GRN.
// Phase 1 ships Purchase Requests; later stages are previewed as disabled.
const STAGES = [
  {
    key: 'requests',
    title: 'Purchase Requests',
    description: 'Raise restock or new-item requests and route them for approval.',
    href: '/procurement/requests',
    icon: FileText,
    live: true,
  },
  {
    key: 'rfqs',
    title: 'RFQs & Quotations',
    description: 'Generate requirement lists, collect and compare vendor quotations.',
    href: '/procurement/rfqs',
    icon: FileSearch,
    live: true,
  },
  {
    key: 'purchase-orders',
    title: 'Purchase Orders',
    description: 'Award vendors and issue approved purchase orders.',
    href: '/procurement/purchase-orders',
    icon: FileText,
    live: true,
  },
  {
    key: 'grn',
    title: 'Goods Receipt',
    description: 'Receive deliveries with three-way matching and inventory posting.',
    href: '/procurement/grn',
    icon: PackageCheck,
    live: false,
  },
];

export default function ProcurementHome() {
  const router = useRouter();

  return (
    <ContentLayout title="Procurement">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Procurement</h2>
          <p className="text-muted-foreground">
            Centralized purchasing — Purchase Request to Purchase Order closure.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            return (
              <Card
                key={stage.key}
                className={
                  stage.live
                    ? 'cursor-pointer transition-colors hover:border-primary'
                    : 'opacity-60'
                }
                onClick={stage.live ? () => router.push(stage.href) : undefined}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6 text-primary" />
                    {stage.live ? (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Badge variant="secondary">Soon</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base pt-2">{stage.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
