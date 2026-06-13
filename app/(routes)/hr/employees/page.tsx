'use client';

/**
 * HR Workforce — all employees from the staff table.
 *
 * After consolidation (migration 20260524083600), hr_employees has been
 * dropped. All employee types now live in the staff table.
 */

import Link from 'next/link';
import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BeatLoader } from 'react-spinners';
import { UsersRound, AlertCircle, ArrowRight } from 'lucide-react';
import { useHREmployees } from '@/hooks/hr/use-employees';

export default function HRWorkforcePage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useHREmployees({
    search: search || undefined,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
    page,
    pageSize: 25,
  });

  return (
    <ContentLayout title="HR — Workforce">
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
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Workforce</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UsersRound className="h-6 w-6" />
              HR Workforce
            </h1>
            <p className="text-sm text-muted-foreground">
              All employees registered in the HR module
              {data ? ` — ${data.metadata.total} total` : ' — loading...'}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/staff/list">
              <ArrowRight className="mr-2 h-4 w-4" />
              Full Employee Management
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Search name / code / email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <Select
                value={activeFilter}
                onValueChange={(v) => {
                  setActiveFilter(v as 'all' | 'active' | 'inactive');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex justify-center py-8">
                <BeatLoader color="#3b82f6" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 py-4">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load: {error instanceof Error ? error.message : 'Unknown error'}</span>
              </div>
            )}
            {data && data.data.length === 0 && (
              <div className="text-center py-12 text-muted-foreground space-y-3">
                <UsersRound className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-medium">No employees found.</p>
                <p className="text-xs max-w-md mx-auto">
                  Employees registered in the HR module will appear here. Manage
                  staff at <Link href="/staff/list" className="underline">Employee Management</Link>.
                </p>
              </div>
            )}
            {data && data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Designation</th>
                      <th className="py-2 pr-3">Institution</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((emp) => (
                      <tr key={emp.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-3 font-mono text-xs">
                          <Link href={`/hr/employees/${emp.id}?source=staff`} className="underline-offset-2 hover:underline">
                            {emp.employee_code ?? '---'}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <Link href={`/hr/employees/${emp.id}?source=staff`} className="hover:underline">
                            {emp.first_name} {emp.last_name ?? ''}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{emp.designation_name ?? '—'}</td>
                        <td className="py-2 pr-3">{emp.organization_name ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {emp.is_active ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data && data.metadata.totalPages > 1 && (
              <div className="flex justify-between items-center pt-4">
                <span className="text-xs text-muted-foreground">
                  Page {data.metadata.page} of {data.metadata.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.metadata.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
