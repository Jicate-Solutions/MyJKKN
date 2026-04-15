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
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessMeals } from '@/hooks/campus-living/use-mess-meals';

export default function MealTrackingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMeal, setSelectedMeal] = useState('all');

  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const { data, isLoading } = useMessMeals(institutionId, {
    date: selectedDate,
    ...(selectedMeal !== 'all' ? { meal_type: selectedMeal as any } : {}),
  });

  if (isLoading) {
    return (
      <ContentLayout title="Meal Tracking">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const mealRecords: any[] = (data as any)?.data || data || [];

  // Derive meal summary from records
  const mealTypes = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
  const mealTimes: Record<string, string> = {
    Breakfast: '7:00 - 9:00 AM',
    Lunch: '12:00 - 2:00 PM',
    Snacks: '4:00 - 5:00 PM',
    Dinner: '7:00 - 9:00 PM',
  };
  const mealSummary = mealTypes.map((meal) => {
    const records = mealRecords.filter((r: any) =>
      (r.meal_type || r.meal || '').toLowerCase() === meal.toLowerCase()
    );
    const scanned = records.length;
    const booked = records.length > 0 ? (records[0]?.booked_count || scanned) : 0;
    const now = new Date();
    const hour = now.getHours();
    let status = 'upcoming';
    if (meal === 'Breakfast' && hour >= 9) status = 'completed';
    else if (meal === 'Lunch' && hour >= 14) status = 'completed';
    else if (meal === 'Snacks' && hour >= 17) status = 'completed';
    else if (meal === 'Dinner' && hour >= 21) status = 'completed';
    else if (
      (meal === 'Breakfast' && hour >= 7) ||
      (meal === 'Lunch' && hour >= 12) ||
      (meal === 'Snacks' && hour >= 16) ||
      (meal === 'Dinner' && hour >= 19)
    ) status = 'in-progress';
    return { meal, time: mealTimes[meal], scanned, booked: booked || scanned, status };
  });

  // Recent scans from records
  const recentScans = mealRecords.slice(0, 10);

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
                {recentScans.map((scan: any) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium">{scan.student || scan.learner_name || scan.learner_id || '-'}</TableCell>
                    <TableCell>{scan.roll || scan.learner_roll || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{scan.meal || scan.meal_type || '-'}</Badge>
                    </TableCell>
                    <TableCell>{scan.block || scan.block_name || '-'}</TableCell>
                    <TableCell>{scan.scanned_at || scan.scan_time || '-'}</TableCell>
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
