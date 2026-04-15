'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Plus, ChevronLeft, ChevronRight, Edit, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessMenus } from '@/hooks/campus-living/use-mess-menus';

export default function MenuPlannerPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [selectedWeek, setSelectedWeek] = useState('current');
  const { data: menuListData, isLoading } = useMessMenus(institutionId);

  if (isLoading) {
    return (
      <ContentLayout title="Menu Planner">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const meals = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];

  const menuData: Record<string, Record<string, string>> = {
    Monday: {
      Breakfast: 'Idli, Sambar, Chutney, Tea/Coffee',
      Lunch: 'Rice, Dal, Paneer Masala, Roti, Salad, Curd',
      Snacks: 'Samosa, Tea',
      Dinner: 'Rice, Chicken Curry, Chapati, Raita',
    },
    Tuesday: {
      Breakfast: 'Dosa, Coconut Chutney, Sambar, Milk',
      Lunch: 'Rice, Rasam, Aloo Gobi, Roti, Pickle',
      Snacks: 'Bread Pakora, Coffee',
      Dinner: 'Biryani, Raita, Salad',
    },
    Wednesday: {
      Breakfast: 'Poha, Boiled Eggs, Tea/Coffee',
      Lunch: 'Rice, Sambar, Bhindi Fry, Roti, Buttermilk',
      Snacks: 'Biscuits, Banana, Tea',
      Dinner: 'Rice, Dal Makhani, Chapati, Salad',
    },
    Thursday: {
      Breakfast: 'Upma, Vada, Chutney, Tea/Coffee',
      Lunch: 'Rice, Kootu, Fish Fry, Roti, Curd',
      Snacks: 'Cutlet, Coffee',
      Dinner: 'Rice, Egg Curry, Chapati, Pickle',
    },
    Friday: {
      Breakfast: 'Pongal, Chutney, Sambar, Milk',
      Lunch: 'Rice, Rasam, Mixed Veg, Roti, Papad',
      Snacks: 'Sundal, Tea',
      Dinner: 'Fried Rice, Gobi Manchurian, Soup',
    },
    Saturday: {
      Breakfast: 'Paratha, Curd, Pickle, Tea/Coffee',
      Lunch: 'Rice, Sambar, Chicken 65, Roti, Salad',
      Snacks: 'Cake, Juice',
      Dinner: 'Chapati, Paneer Butter Masala, Rice, Dal',
    },
    Sunday: {
      Breakfast: 'Chole Bhature, Lassi',
      Lunch: 'Special Biryani, Raita, Gulab Jamun',
      Snacks: 'Fruit Salad, Milkshake',
      Dinner: 'Rice, Egg Masala, Chapati, Ice Cream',
    },
  };

  return (
    <ContentLayout title="Menu Planner">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Weekly Menu Planner</h1>
            <p className="text-muted-foreground">
              Plan and manage daily meals for all hostel blocks
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Menu
          </Button>
        </div>

        {/* Week Navigation */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-4">
                <h3 className="font-semibold">Week: Feb 17 - Feb 23, 2026</h3>
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current Week</SelectItem>
                    <SelectItem value="next">Next Week</SelectItem>
                    <SelectItem value="prev">Previous Week</SelectItem>
                  </SelectContent>
                </Select>
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Published</Badge>
              </div>
              <Button variant="outline" size="sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Menu Grid */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px] sticky left-0 bg-background">Day</TableHead>
                    {meals.map((meal) => (
                      <TableHead key={meal} className="min-w-[200px]">{meal}</TableHead>
                    ))}
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((day) => (
                    <TableRow key={day}>
                      <TableCell className="font-medium sticky left-0 bg-background">
                        {day}
                      </TableCell>
                      {meals.map((meal) => (
                        <TableCell key={meal} className="text-sm">
                          {menuData[day]?.[meal] || '-'}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Menus */}
        <Card>
          <CardHeader>
            <CardTitle>Saved Menus</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { id: '1', week: 'Feb 17 - Feb 23, 2026', status: 'published', caterer: 'Annapurna Catering' },
                { id: '2', week: 'Feb 10 - Feb 16, 2026', status: 'published', caterer: 'Annapurna Catering' },
                { id: '3', week: 'Feb 24 - Mar 2, 2026', status: 'draft', caterer: 'Annapurna Catering' },
              ].map((menu) => (
                <div key={menu.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{menu.week}</p>
                    <p className="text-sm text-muted-foreground">{menu.caterer}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={menu.status === 'published' ? 'default' : 'secondary'}>
                      {menu.status}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/campus-living/mess/menu/${menu.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
