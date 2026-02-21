'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Save, Plus, Edit, IndianRupee } from 'lucide-react';

export default function FeeConfigPage() {
  const feeStructure = [
    { id: '1', room_type: 'Single (AC)', hostel_fee: 60000, mess_fee: 54000, deposit: 5000, maintenance: 2000, total: 121000 },
    { id: '2', room_type: 'Single (Non-AC)', hostel_fee: 45000, mess_fee: 54000, deposit: 5000, maintenance: 2000, total: 106000 },
    { id: '3', room_type: 'Double (AC)', hostel_fee: 45000, mess_fee: 54000, deposit: 5000, maintenance: 2000, total: 106000 },
    { id: '4', room_type: 'Double (Non-AC)', hostel_fee: 35000, mess_fee: 54000, deposit: 5000, maintenance: 2000, total: 96000 },
    { id: '5', room_type: 'Triple', hostel_fee: 28000, mess_fee: 54000, deposit: 5000, maintenance: 2000, total: 89000 },
    { id: '6', room_type: 'Dormitory', hostel_fee: 20000, mess_fee: 54000, deposit: 3000, maintenance: 1000, total: 78000 },
  ];

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

  return (
    <ContentLayout title="Fee Configuration">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fee Configuration</h1>
            <p className="text-muted-foreground">Set hostel fees by room type and category</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Plus className="mr-2 h-4 w-4" />Add Room Type</Button>
            <Button><Save className="mr-2 h-4 w-4" />Save Changes</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Fee Structure (Per Semester)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room Type</TableHead>
                  <TableHead>Hostel Fee</TableHead>
                  <TableHead>Mess Fee</TableHead>
                  <TableHead>Deposit</TableHead>
                  <TableHead>Maintenance</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeStructure.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.room_type}</TableCell>
                    <TableCell>{formatCurrency(row.hostel_fee)}</TableCell>
                    <TableCell>{formatCurrency(row.mess_fee)}</TableCell>
                    <TableCell>{formatCurrency(row.deposit)}</TableCell>
                    <TableCell>{formatCurrency(row.maintenance)}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(row.total)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment Settings</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment Due Date (days after semester start)</Label>
              <Input type="number" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label>Late Fee Per Day (INR)</Label>
              <Input type="number" defaultValue="50" />
            </div>
            <div className="space-y-2">
              <Label>Max Late Fee Cap (INR)</Label>
              <Input type="number" defaultValue="2000" />
            </div>
            <div className="space-y-2">
              <Label>Installment Options</Label>
              <Input type="number" defaultValue="3" placeholder="Number of installments allowed" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
