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
} from 'lucide-react';
import { useState } from 'react';

export default function WasteTrackingPage() {
  const [showForm, setShowForm] = useState(false);

  // TODO: Replace with actual hook
  // const { data: wasteData, isLoading } = useMessWaste();

  const wasteRecords = [
    { id: '1', date: '2026-02-21', meal: 'Lunch', category: 'Cooked Food', quantity_kg: 8.5, reason: 'Over-preparation', recorded_by: 'Kitchen Staff' },
    { id: '2', date: '2026-02-21', meal: 'Breakfast', quantity_kg: 3.2, category: 'Cooked Food', reason: 'Leftovers', recorded_by: 'Kitchen Staff' },
    { id: '3', date: '2026-02-20', meal: 'Dinner', quantity_kg: 12.0, category: 'Cooked Food', reason: 'Over-preparation', recorded_by: 'Kitchen Staff' },
    { id: '4', date: '2026-02-20', meal: 'Lunch', quantity_kg: 6.3, category: 'Raw Material', reason: 'Spoilage', recorded_by: 'Store Manager' },
    { id: '5', date: '2026-02-19', meal: 'Dinner', quantity_kg: 9.1, category: 'Plate Waste', reason: 'Student leftovers', recorded_by: 'Kitchen Staff' },
  ];

  const summary = {
    today: 11.7,
    week_avg: 15.2,
    month_total: 342,
    trend: -12,
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
              <div className="flex items-center text-xs text-green-600">
                <TrendingDown className="mr-1 h-3 w-3" />
                {Math.abs(summary.trend)}% below average
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

        {/* Chart Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>Waste Trends by Meal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/50">
              <p className="text-muted-foreground">Chart: Daily waste by meal type (Breakfast, Lunch, Dinner) over the last 30 days</p>
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
              <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="waste_date">Date</Label>
                  <Input id="waste_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waste_meal">Meal</Label>
                  <Select>
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
                  <Select>
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
                  <Input id="waste_quantity" type="number" step="0.1" placeholder="0.0" />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="waste_reason">Reason</Label>
                  <Input id="waste_reason" placeholder="Reason for waste" />
                </div>
                <div className="sm:col-span-2 flex items-end gap-2">
                  <Button type="button" onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
                  <Button type="submit">Save Entry</Button>
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
                {wasteRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.meal}</Badge>
                    </TableCell>
                    <TableCell>{record.category}</TableCell>
                    <TableCell className="font-medium">{record.quantity_kg} kg</TableCell>
                    <TableCell className="text-muted-foreground">{record.reason}</TableCell>
                    <TableCell className="text-muted-foreground">{record.recorded_by}</TableCell>
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
