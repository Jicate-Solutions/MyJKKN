'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import { POLICY_TABLES, POLICY_CATEGORIES } from '@/features/hr/policies/registry';

export default function HRPoliciesHubPage() {
  return (
    <ContentLayout title="HR Policies — Hub">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Policies</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Policy Management</h1>
          <p className="text-sm text-muted-foreground">
            Sprint 2 — {POLICY_TABLES.length} HR policy tables, all CRUD-able by HR Officer with full version history.
          </p>
        </div>

        {POLICY_CATEGORIES.map((cat) => {
          const items = POLICY_TABLES.filter((t) => t.category === cat);
          return (
            <Card key={cat}>
              <CardHeader>
                <CardTitle className="text-base">{cat}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => (
                    <Link
                      key={t.table}
                      href={`/hr/policies/${t.table}`}
                      className="border rounded-md p-3 hover:bg-muted/40 transition flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">{t.table}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 mt-1 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader><CardTitle className="text-sm">Sprint 2 Summary</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>• {POLICY_TABLES.length} policy tables, {POLICY_CATEGORIES.length} categories</p>
            <p>• Versioned via valid_from / valid_until / superseded_by</p>
            <p>• Edit creates a new version; history view shows diffs + restore</p>
            <p>• Generic <code>PolicyEditor</code> component drives all 19 routes</p>
            <p>• Schema, RLS, RPCs (history/diff/restore) already on production <Badge variant="outline">verified</Badge></p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
