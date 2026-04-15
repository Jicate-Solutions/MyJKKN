'use client';

/**
 * HR Module — Central HR Command Center (Sprint 1 stub)
 *
 * Per spec v4 §8.1: 4-quadrant dashboard (Consolidated Payroll, Group Leave, Consolidated Attendance, Compliance).
 * Sprint 1 ships empty quadrant placeholders. Real data lands in Sprint 6.
 */

import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Users, UsersRound, Banknote, CalendarDays, Building2 } from 'lucide-react';

export default function HRDashboardPage() {
  return (
    <ContentLayout title="HR — Central Command Center">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>HR</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">HR Command Center</h1>
            <p className="text-sm text-muted-foreground">
              JKKN Group HR — leave, policies, and the non-staff workforce
              (guests, vendors, TAs, volunteers). Full-time staff live in the
              <Link href="/staff/list" className="underline ml-1">Staff module</Link>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Two CTAs make the persona split explicit:
                full-time staff live in the staff module; non-staff (guests,
                vendors, TAs, volunteers) live in HR. Single "Manage Employees"
                button caused users to expect /hr/employees to show all 393
                staff (it didn't, and shouldn't). */}
            <Button asChild variant="outline">
              <Link href="/staff/list">
                <Users className="mr-2 h-4 w-4" />
                Full-Time Staff
              </Link>
            </Button>
            <Button asChild>
              <Link href="/hr/employees">
                <UsersRound className="mr-2 h-4 w-4" />
                Non-Staff Workforce
              </Link>
            </Button>
          </div>
        </div>

        {/* 4-quadrant command center (stubs for Sprint 1) */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Employees</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Across all institutions</p>
            </CardContent>
          </Card>
          <Card className="opacity-60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attendance</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">Sprint 5</div>
              <p className="text-xs text-muted-foreground">Arriving in Sprint 5</p>
            </CardContent>
          </Card>
          <Card className="opacity-60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leave</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">Sprint 3</div>
              <p className="text-xs text-muted-foreground">Arriving in Sprint 3</p>
            </CardContent>
          </Card>
          <Card className="opacity-60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payroll</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">Sprint 7</div>
              <p className="text-xs text-muted-foreground">Arriving in Sprint 7</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sprint 1 Foundation — Shipped</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li>Shadow-tenant pattern: 11 JKKN institutions synced to hr_organizations</li>
              <li>Employee master: 393 staff backfilled into hr_employees</li>
              <li>13 designations × 11 institutions = 143 designations seeded from HR manual §13</li>
              <li>3 cadres seeded (Teaching, Supporting-Technical, Non-Technical)</li>
              <li>RLS policies active with super_admin bypass (mirrors 46-policy pattern)</li>
              <li>Zero impact on MyJKKN core queries — verified via EXPLAIN ANALYZE</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What&apos;s Next</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Sprint 2: Policy Management UI (18 CRUD tables for Policy-as-Data)</p>
            <p>Sprint 3: Leave workflow (extending existing institution_leaves infrastructure)</p>
            <p>Sprint 4–5: eSSL edge agent + attendance engine with class-proxy fallback</p>
            <p>Sprint 6+: Command center quadrants light up with real data</p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
