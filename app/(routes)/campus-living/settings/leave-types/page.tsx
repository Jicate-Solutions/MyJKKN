'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Edit, Save } from 'lucide-react';

export default function LeaveTypesPage() {
  const leaveTypes = [
    { id: '1', name: 'Weekend Leave', max_days: 2, parent_consent: false, warden_approval: true, auto_approve: false, active: true },
    { id: '2', name: 'Holiday Leave', max_days: 15, parent_consent: true, warden_approval: true, auto_approve: false, active: true },
    { id: '3', name: 'Medical Leave', max_days: 7, parent_consent: true, warden_approval: true, auto_approve: false, active: true },
    { id: '4', name: 'Emergency Leave', max_days: 3, parent_consent: true, warden_approval: true, auto_approve: false, active: true },
    { id: '5', name: 'Day Pass', max_days: 1, parent_consent: false, warden_approval: false, auto_approve: true, active: true },
    { id: '6', name: 'Event Leave', max_days: 3, parent_consent: false, warden_approval: true, auto_approve: false, active: true },
    { id: '7', name: 'Long Leave', max_days: 30, parent_consent: true, warden_approval: true, auto_approve: false, active: false },
  ];

  return (
    <ContentLayout title="Leave Types">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Leave Type Configuration</h1>
            <p className="text-muted-foreground">Configure leave types, limits, and approval requirements</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Plus className="mr-2 h-4 w-4" />Add Leave Type</Button>
            <Button><Save className="mr-2 h-4 w-4" />Save</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Max Days</TableHead>
                  <TableHead>Parent Consent</TableHead>
                  <TableHead>Warden Approval</TableHead>
                  <TableHead>Auto-Approve</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveTypes.map((leave) => (
                  <TableRow key={leave.id} className={!leave.active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{leave.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{leave.max_days} {leave.max_days === 1 ? 'day' : 'days'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={leave.parent_consent} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={leave.warden_approval} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={leave.auto_approve} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={leave.active} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
