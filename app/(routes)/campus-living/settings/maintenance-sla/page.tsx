'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Save, Wrench } from 'lucide-react';

export default function MaintenanceSlaPage() {
  const slaConfig = [
    { category: 'Plumbing', critical: 4, high: 12, medium: 24, low: 72 },
    { category: 'Electrical', critical: 2, high: 8, medium: 24, low: 72 },
    { category: 'Civil / Structural', critical: 4, high: 24, medium: 48, low: 168 },
    { category: 'Carpentry', critical: 8, high: 24, medium: 48, low: 168 },
    { category: 'Painting', critical: 24, high: 48, medium: 72, low: 336 },
    { category: 'Pest Control', critical: 4, high: 12, medium: 24, low: 72 },
    { category: 'Cleaning', critical: 2, high: 4, medium: 12, low: 24 },
  ];

  return (
    <ContentLayout title="Maintenance SLA">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Maintenance SLA Configuration</h1>
            <p className="text-muted-foreground">Set resolution time targets (in hours) by category and priority</p>
          </div>
          <Button><Save className="mr-2 h-4 w-4" />Save Changes</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              SLA Targets (Hours to Resolve)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Critical</TableHead>
                  <TableHead className="text-center">High</TableHead>
                  <TableHead className="text-center">Medium</TableHead>
                  <TableHead className="text-center">Low</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slaConfig.map((row) => (
                  <TableRow key={row.category}>
                    <TableCell className="font-medium">{row.category}</TableCell>
                    <TableCell className="text-center">
                      <Input type="number" defaultValue={row.critical} className="w-20 mx-auto text-center" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" defaultValue={row.high} className="w-20 mx-auto text-center" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" defaultValue={row.medium} className="w-20 mx-auto text-center" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" defaultValue={row.low} className="w-20 mx-auto text-center" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Escalation Rules</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Auto-escalate After (% of SLA)</Label>
              <Input type="number" defaultValue="75" />
              <p className="text-xs text-muted-foreground">Escalate when 75% of SLA time has passed</p>
            </div>
            <div className="space-y-2">
              <Label>Escalation Notify</Label>
              <Input defaultValue="Chief Warden, Maintenance Head" />
              <p className="text-xs text-muted-foreground">Comma-separated roles to notify on escalation</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
