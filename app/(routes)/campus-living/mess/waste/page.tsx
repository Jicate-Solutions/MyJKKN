'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Trash2,
  Plus,
  TrendingDown,
  TrendingUp,
  CalendarDays,
  Scale,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessWasteLogs, useCreateMessWasteLog } from '@/hooks/campus-living/use-mess-waste';

export default function WasteTrackingPage() {
  const [showForm, setShowForm] = useState(false);

  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data, isLoading } = useMessWasteLogs(institutionId);
  const createWasteLog = useCreateMessWasteLog();

  if (isLoading) {
    return (
      <ContentLayout title="Waste Tracking">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const wasteRecords: any[] = (data as any)?.data || data || [];

  // Compute summary from records
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = wasteRecords.filter((r: any) => r.date === today);
  const todayTotal = todayRecords.reduce((sum: number, r: any) => sum + (r.quantity_kg || 0), 0);
  const totalQty = wasteRecords.reduce((sum: number, r: any) => sum + (r.quantity_kg || 0), 0);
  const uniqueDays = [...new Set(wasteRecords.map((r: any) => r.date))].length;
  const weekAvg = uniqueDays > 0 ? Math.round((totalQty / uniqueDays) * 10) / 10 : 0;
  const trend = weekAvg > 0 ? Math.round(((todayTotal - weekAvg) / weekAvg) * 100) : 0;

  const summary = {
    today: Math.round(todayTotal * 10) / 10,
    week_avg: weekAvg,
    month_total: Math.round(totalQty * 10) / 10,
    trend,
  };

  return (
    <ContentLayout title="Waste Tracking">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Food Waste Tracking</h1>
            <p className="text-muted-foreground">
              Log and monitor food waste to reduce costs and improve sustainability
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            Log Waste
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Waste</CardTitle>
              <Scale className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.today} kg</div>
              <div className={`flex items-center text-xs ${summary.trend <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.trend <= 0 ? <TrendingDown className="mr-1 h-3 w-3" /> : <TrendingUp className="mr-1 h-3 w-3" />}
                {Math.abs(summary.trend)}% {summary.trend <= 0 ? 'below' : 'above'} average
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Weekly Average</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.week_avg} kg/day</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Month Total</CardTitle>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.month_total} kg</div>
              <p className="text-xs text-muted-foreground">Feb 2026</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Waste per Student</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">28g</div>
              <p className="text-xs text-muted-foreground">per meal avg</p>
            </CardContent>
          </Card>
        </div>

        {/* Waste by Meal Type */}
        <Card>
          <CardHeader>
            <CardTitle>Waste by Meal Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['Breakfast', 'Lunch', 'Snacks', 'Dinner'].map((mealType) => {
                const mealRecords = wasteRecords.filter((r: any) => (r.meal || r.meal_type || '').toLowerCase() === mealType.toLowerCase());
                const mealTotal = mealRecords.reduce((sum: number, r: any) => sum + (r.quantity_kg || 0), 0);
                const maxTotal = Math.max(totalQty, 1);
                const percentage = totalQty > 0 ? (mealTotal / maxTotal) * 100 : 0;
                return (
                  <div key={mealType} className="flex items-center gap-4">
                    <span className="text-sm font-medium w-20">{mealType}</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-orange-500 rounded-full h-4 transition-all"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-20 text-right">
                      {Math.round(mealTotal * 10) / 10} kg
                    </span>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {mealRecords.length} entries
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Log Waste Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Log New Waste Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const formData = new FormData(form);
                  try {
                    await createWasteLog.mutateAsync({
                      institution_id: institutionId,
                      date: formData.get('waste_date') as string,
                      meal_type: formData.get('waste_meal') as any,
                      waste_category: formData.get('waste_category') as any,
                      quantity_kg: parseFloat(formData.get('waste_quantity') as string) || 0,
                      reason: formData.get('waste_reason') as string,
                      recorded_by: profile?.id || '',
                    } as any);
                    setShowForm(false);
                  } catch {
                    // Error handled by mutation hook
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="waste_date">Date</Label>
                  <Input id="waste_date" name="waste_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waste_meal">Meal</Label>
                  <Select name="waste_meal">
                    <SelectTrigger>
                      <SelectValue placeholder="Select meal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="snacks">Snacks</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waste_category">Category</Label>
                  <Select name="waste_category">
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cooked">Cooked Food</SelectItem>
                      <SelectItem value="raw">Raw Material</SelectItem>
                      <SelectItem value="plate">Plate Waste</SelectItem>
                      <SelectItem value="expired">Expired Items</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waste_quantity">Quantity (kg)</Label>
                  <Input id="waste_quantity" name="waste_quantity" type="number" step="0.1" placeholder="0.0" />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="waste_reason">Reason</Label>
                  <Input id="waste_reason" name="waste_reason" placeholder="Reason for waste" />
                </div>
                <div className="sm:col-span-2 flex items-end gap-2">
                  <Button type="button" onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
                  <Button type="submit" disabled={createWasteLog.isPending}>
                    {createWasteLog.isPending ? 'Saving...' : 'Save Entry'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Waste Records Table */}
        <Card>
          <CardHeader>
            <CardTitle>Waste Records</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Recorded By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wasteRecords.map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.meal || record.meal_type || '-'}</Badge>
                    </TableCell>
                    <TableCell>{record.category || record.waste_category || '-'}</TableCell>
                    <TableCell className="font-medium">{record.quantity_kg} kg</TableCell>
                    <TableCell className="text-muted-foreground">{record.reason || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{record.recorded_by || record.recorded_by_name || '-'}</TableCell>
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
