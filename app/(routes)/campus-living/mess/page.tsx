'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UtensilsCrossed,
  Users,
  ChefHat,
  Trash2,
  Star,
  CalendarDays,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export default function MessDashboardPage() {
  // TODO: Replace with actual hooks
  // const { data: dashboardData, isLoading } = useMessDashboard();

  const todayMenu = [
    { meal: 'Breakfast', items: 'Idli, Sambar, Chutney, Tea', time: '7:00 - 9:00 AM' },
    { meal: 'Lunch', items: 'Rice, Dal, Paneer Butter Masala, Roti, Salad', time: '12:00 - 2:00 PM' },
    { meal: 'Snacks', items: 'Samosa, Tea', time: '4:00 - 5:00 PM' },
    { meal: 'Dinner', items: 'Rice, Chicken Curry, Chapati, Curd', time: '7:00 - 9:00 PM' },
  ];

  return (
    <ContentLayout title="Mess Dashboard">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mess & Cafeteria</h1>
            <p className="text-muted-foreground">
              Overview of mess operations, meals, and food services
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/mess/feedback">
                <Star className="mr-2 h-4 w-4" />
                Feedback
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/mess/meals/scan">
                <UtensilsCrossed className="mr-2 h-4 w-4" />
                Meal Scan
              </Link>
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Caterers</CardTitle>
              <ChefHat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">Across 5 blocks</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Meals Served</CardTitle>
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,247</div>
              <div className="flex items-center text-xs text-green-600">
                <TrendingUp className="mr-1 h-3 w-3" />
                +5% from yesterday
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg. Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3.8 / 5</div>
              <p className="text-xs text-muted-foreground">Based on 156 reviews this week</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Waste Today</CardTitle>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">18 kg</div>
              <div className="flex items-center text-xs text-red-600">
                <TrendingDown className="mr-1 h-3 w-3" />
                -12% from avg
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Menu */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Today&apos;s Menu
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/mess/menu">
                View Full Menu
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {todayMenu.map((item) => (
                <div key={item.meal} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{item.meal}</h4>
                    <Badge variant="outline">{item.time}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.items}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Meal Counts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Meal Headcount (Today)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { meal: 'Breakfast', served: 312, expected: 350, status: 'completed' },
                { meal: 'Lunch', served: 410, expected: 420, status: 'completed' },
                { meal: 'Snacks', served: 225, expected: 300, status: 'in-progress' },
                { meal: 'Dinner', served: 0, expected: 400, status: 'upcoming' },
              ].map((m) => (
                <div key={m.meal} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{m.meal}</h4>
                    <Badge
                      variant={
                        m.status === 'completed'
                          ? 'default'
                          : m.status === 'in-progress'
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {m.status === 'completed'
                        ? 'Done'
                        : m.status === 'in-progress'
                        ? 'Serving'
                        : 'Upcoming'}
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold">
                    {m.served}
                    <span className="text-sm text-muted-foreground font-normal">
                      {' '}
                      / {m.expected}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2"
                      style={{ width: `${Math.min((m.served / m.expected) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: 'Caterers', desc: 'Manage caterer contracts and performance', href: '/campus-living/mess/caterers', icon: ChefHat },
            { title: 'Billing', desc: 'View billing periods and student charges', href: '/campus-living/mess/billing', icon: CalendarDays },
            { title: 'Meal Bookings', desc: 'Manage meal opt-in/opt-out requests', href: '/campus-living/mess/bookings', icon: UtensilsCrossed },
            { title: 'Waste Tracking', desc: 'Log and monitor food waste', href: '/campus-living/mess/waste', icon: Trash2 },
            { title: 'Menu Planner', desc: 'Plan weekly menus for all meals', href: '/campus-living/mess/menu', icon: CalendarDays },
            { title: 'Feedback', desc: 'View student ratings and complaints', href: '/campus-living/mess/feedback', icon: Star },
          ].map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <link.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{link.title}</h3>
                    <p className="text-sm text-muted-foreground">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
