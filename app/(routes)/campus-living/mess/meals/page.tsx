'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  UtensilsCrossed,
  Users,
  ScanLine,
  CalendarDays,
  Search,
} from 'lucide-react';
import { useState } from 'react';

export default function MealTrackingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMeal, setSelectedMeal] = useState('all');

  // TODO: Replace with actual hook
  // const { data: mealData, isLoading } = useMealTracking(selectedDate);

  const mealSummary = [
    { meal: 'Breakfast', time: '7:00 - 9:00 AM', scanned: 312, booked: 350, status: 'completed' },
    { meal: 'Lunch', time: '12:00 - 2:00 PM', scanned: 410, booked: 420, status: 'completed' },
    { meal: 'Snacks', time: '4:00 - 5:00 PM', scanned: 180, booked: 300, status: 'in-progress' },
    { meal: 'Dinner', time: '7:00 - 9:00 PM', scanned: 0, booked: 400, status: 'upcoming' },
  ];

  const recentScans = [
    { id: '1', student: 'Arun Kumar', roll: 'CS2024001', meal: 'Lunch', scanned_at: '12:15 PM', block: 'Block A' },
    { id: '2', student: 'Priya Sharma', roll: 'EC2024015', meal: 'Lunch', scanned_at: '12:18 PM', block: 'Block B' },
    { id: '3', student: 'Rahul Patel', roll: 'ME2024003', meal: 'Lunch', scanned_at: '12:22 PM', block: 'Block A' },
    { id: '4', student: 'Sneha Reddy', roll: 'CS2024042', meal: 'Lunch', scanned_at: '12:25 PM', block: 'Block C' },
    { id: '5', student: 'Vikram Singh', roll: 'EE2024010', meal: 'Lunch', scanned_at: '12:30 PM', block: 'Block A' },
  ];

  return (
    <ContentLayout title="Meal Tracking">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Daily Meal Tracking</h1>
            <p className="text-muted-foreground">
              Monitor meal headcounts and scan records
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/mess/meals/scan">
              <ScanLine className="mr-2 h-4 w-4" />
              Open Scanner
            </Link>
          </Button>
        </div>

        {/* Date Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-[180px]"
                />
              </div>
              <Select value={selectedMeal} onValueChange={setSelectedMeal}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by meal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Meals</SelectItem>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="snacks">Snacks</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Meal Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {mealSummary.map((meal) => (
            <Card key={meal.meal}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{meal.meal}</CardTitle>
                  <Badge
                    variant={
                      meal.status === 'completed'
                        ? 'default'
                        : meal.status === 'in-progress'
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {meal.status === 'completed' ? 'Done' : meal.status === 'in-progress' ? 'Serving' : 'Upcoming'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-2">{meal.time}</div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold">{meal.scanned}</span>
                  <span className="text-muted-foreground text-sm pb-0.5">/ {meal.booked} booked</span>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{ width: `${meal.booked > 0 ? Math.min((meal.scanned / meal.booked) * 100, 100) : 0}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {meal.booked > 0 ? Math.round((meal.scanned / meal.booked) * 100) : 0}% attendance
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Scans */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5" />
                Recent Scan Records
              </CardTitle>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search student..." className="pl-10" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Scanned At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentScans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium">{scan.student}</TableCell>
                    <TableCell>{scan.roll}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{scan.meal}</Badge>
                    </TableCell>
                    <TableCell>{scan.block}</TableCell>
                    <TableCell>{scan.scanned_at}</TableCell>
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
