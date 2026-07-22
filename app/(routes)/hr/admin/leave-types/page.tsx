'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus, Pencil, Archive } from 'lucide-react';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useHRLeaveTypes, useDeleteHRLeaveType } from '@/hooks/hr/use-hr-leave-types';
import { LeaveTypeFormDialog } from './_components/leave-type-form-dialog';
import type { HRLeaveType } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

export default function HRLeaveTypesPage() {
  const { mappings } = useHrOrgMappings();
  const [hrOrgId, setHrOrgId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HRLeaveType | null>(null);

  const { data: types, isLoading } = useHRLeaveTypes(
    hrOrgId ? { hr_organization_id: hrOrgId } : {}
  );
  const archive = useDeleteHRLeaveType();

  const onArchive = async (t: HRLeaveType) => {
    try {
      await archive.mutateAsync(t.id);
      toast.success(`${t.leave_type_name} archived`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <PermissionGuard module="hr.leave.types" action="manage">
      <ContentLayout title="HR Leave Types">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Leave Types</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div className="w-72">
                <Label>Organization</Label>
                <Select value={hrOrgId} onValueChange={setHrOrgId}>
                  <SelectTrigger><SelectValue placeholder="All organizations" /></SelectTrigger>
                  <SelectContent>
                    {mappings.map((m) => (
                      <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                        {m.organization_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!hrOrgId} onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Leave Type
              </Button>
            </div>

            {!hrOrgId && (
              <p className="text-sm text-muted-foreground">
                Select an organization to add a leave type. Leave types are scoped per organization.
              </p>
            )}

            {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

            {!isLoading && (types ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No leave types configured.</p>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              {(types ?? []).map((t) => (
                <div key={t.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: t.color_code }} />
                        {t.leave_type_name}
                        {!t.is_active && <Badge variant="secondary">Archived</Badge>}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{t.leave_type_code}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {t.is_active && (
                        <Button size="icon" variant="ghost" onClick={() => onArchive(t)}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{t.default_entitled_days} days</Badge>
                    <Badge variant="outline">{t.duration_type}</Badge>
                    {t.is_paid && <Badge variant="outline">Paid</Badge>}
                    {t.allow_carry_forward && <Badge variant="outline">Carry-forward</Badge>}
                    {t.is_encashable && <Badge variant="outline">Encashable</Badge>}
                    {t.applicable_gender !== 'all' && <Badge variant="outline">{t.applicable_gender}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <LeaveTypeFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          hrOrgId={hrOrgId}
          leaveType={editing}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
