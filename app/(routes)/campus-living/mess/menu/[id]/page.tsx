'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ArrowLeft, Save, Send, Edit, X } from 'lucide-react';
import { useState } from 'react';

interface MenuDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MenuDetailPage({ params }: MenuDetailPageProps) {
  const { id } = use(params);
  const [isEditing, setIsEditing] = useState(false);

  // TODO: Replace with actual hook
  // const { data: menu, isLoading } = useMessMenuDetail(id);

  const menu = {
    id,
    week: 'Feb 17 - Feb 23, 2026',
    status: 'published',
    caterer: 'Annapurna Catering Services',
    created_by: 'Admin',
    created_at: '2026-02-14',
  };

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
    <ContentLayout title="Menu Detail">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/mess/menu">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Menu: {menu.week}</h1>
              <p className="text-muted-foreground">{menu.caterer}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant={menu.status === 'published' ? 'default' : 'secondary'}>
              {menu.status}
            </Badge>
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button size="sm">
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                {menu.status === 'draft' && (
                  <Button size="sm">
                    <Send className="mr-2 h-4 w-4" />
                    Publish
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Menu Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Menu</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px] sticky left-0 bg-background">Day</TableHead>
                    {meals.map((meal) => (
                      <TableHead key={meal} className="min-w-[220px]">{meal}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((day) => (
                    <TableRow key={day}>
                      <TableCell className="font-medium sticky left-0 bg-background">
                        {day}
                      </TableCell>
                      {meals.map((meal) => (
                        <TableCell key={meal}>
                          {isEditing ? (
                            <Input
                              defaultValue={menuData[day]?.[meal] || ''}
                              className="min-w-[200px]"
                            />
                          ) : (
                            <span className="text-sm">{menuData[day]?.[meal] || '-'}</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Menu Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Created By</Label>
              <p className="font-medium">{menu.created_by}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Created On</Label>
              <p className="font-medium">{new Date(menu.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Caterer</Label>
              <p className="font-medium">{menu.caterer}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <p className="font-medium capitalize">{menu.status}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
