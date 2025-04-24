// app/(routes)/digital-resources/_components/digital-resource-dashboard.tsx

'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDigitalResources } from '@/hooks/resource/digital/use-digital-resources';
import { useDigitalReservations } from '@/hooks/resource/digital/use-digital-reservations';
import { DigitalResource, DigitalReservation } from '@/types/digital-resources';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Loader2 } from 'lucide-react';

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884d8',
  '#82ca9d'
];

export function DigitalResourceDashboard() {
  // Direct data fetch without using ID-based hooks to avoid UUID errors
  const {
    resources,
    loading: resourcesLoading,
    error: resourcesError
  } = useDigitalResources({
    limit: 100,
    isActive: true
  });

  const {
    reservations,
    loading: reservationsLoading,
    error: reservationsError
  } = useDigitalReservations({
    limit: 100
  });

  const [resourceTypeData, setResourceTypeData] = useState<
    { name: string; value: number }[]
  >([]);
  const [accessMethodData, setAccessMethodData] = useState<
    { name: string; value: number }[]
  >([]);
  const [reservationStatusData, setReservationStatusData] = useState<
    { name: string; value: number }[]
  >([]);
  const [monthlyReservationsData, setMonthlyReservationsData] = useState<
    { name: string; count: number }[]
  >([]);

  useEffect(() => {
    if (resources && resources.length > 0) {
      try {
        // Process resource type data
        const typeCount: Record<string, number> = {};
        resources.forEach((resource: DigitalResource) => {
          if (resource.type) {
            typeCount[resource.type] = (typeCount[resource.type] || 0) + 1;
          }
        });

        const typeData = Object.keys(typeCount).map((type) => ({
          name: type || 'Unknown',
          value: typeCount[type]
        }));
        setResourceTypeData(typeData);

        // Process access method data
        const accessMethodCount: Record<string, number> = {};
        resources.forEach((resource: DigitalResource) => {
          if (resource.access_method) {
            accessMethodCount[resource.access_method] =
              (accessMethodCount[resource.access_method] || 0) + 1;
          }
        });

        const accessData = Object.keys(accessMethodCount).map((method) => ({
          name: method || 'Unknown',
          value: accessMethodCount[method]
        }));
        setAccessMethodData(accessData);
      } catch (error) {
        console.error('Error processing resource data:', error);
      }
    }
  }, [resources]);

  useEffect(() => {
    if (reservations && reservations.length > 0) {
      try {
        // Process reservation status data
        const statusCount: Record<string, number> = {};
        reservations.forEach((reservation: DigitalReservation) => {
          if (reservation.status) {
            statusCount[reservation.status] =
              (statusCount[reservation.status] || 0) + 1;
          }
        });

        const statusData = Object.keys(statusCount).map((status) => ({
          name: status || 'Unknown',
          value: statusCount[status]
        }));
        setReservationStatusData(statusData);

        // Process monthly reservations data
        const monthlyCount: Record<string, number> = {};
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 5);

        // Initialize all months
        for (let i = 0; i < 6; i++) {
          const date = new Date(sixMonthsAgo);
          date.setMonth(sixMonthsAgo.getMonth() + i);
          const monthYear = `${date.toLocaleString('default', {
            month: 'short'
          })} ${date.getFullYear()}`;
          monthlyCount[monthYear] = 0;
        }

        // Count reservations by month
        reservations.forEach((reservation: DigitalReservation) => {
          if (reservation.reservation_start) {
            const reservationDate = new Date(reservation.reservation_start);
            // Only count reservations from the last 6 months
            if (reservationDate >= sixMonthsAgo && reservationDate <= now) {
              const monthYear = `${reservationDate.toLocaleString('default', {
                month: 'short'
              })} ${reservationDate.getFullYear()}`;
              monthlyCount[monthYear] = (monthlyCount[monthYear] || 0) + 1;
            }
          }
        });

        const monthlyData = Object.keys(monthlyCount).map((month) => ({
          name: month,
          count: monthlyCount[month]
        }));
        setMonthlyReservationsData(monthlyData);
      } catch (error) {
        console.error('Error processing reservation data:', error);
      }
    }
  }, [reservations]);

  // If there's a database error, show a message
  if (resourcesError || reservationsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Digital Resources Dashboard</CardTitle>
          <CardDescription>
            There was an issue loading the dashboard data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <p>
              We encountered a problem loading the digital resources data. This
              could be because:
            </p>
            <ul className='list-disc pl-6 space-y-1'>
              <li>
                The database tables for digital resources might not be set up
                yet
              </li>
              <li>You might not have any digital resources created</li>
              <li>There might be a temporary connection issue</li>
            </ul>
            <p className='font-medium mt-4'>What you can do:</p>
            <ul className='list-disc pl-6 space-y-1'>
              <li>Check if you&apos;ve created any digital resources</li>
              <li>Refresh the page and try again</li>
              <li>Contact the administrator if the issue persists</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (resourcesLoading || reservationsLoading) {
    return (
      <div className='flex justify-center items-center h-64'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <Tabs defaultValue='overview' className='w-full'>
        <TabsList className='grid w-full grid-cols-3'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='resources'>Resources</TabsTrigger>
          <TabsTrigger value='reservations'>Reservations</TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Card>
              <CardHeader>
                <CardTitle>Digital Resources</CardTitle>
                <CardDescription>Total: {resources.length}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-[300px]'>
                  {resourceTypeData.length > 0 ? (
                    <ResponsiveContainer width='100%' height='100%'>
                      <PieChart>
                        <Pie
                          data={resourceTypeData}
                          cx='50%'
                          cy='50%'
                          labelLine={true}
                          outerRadius={80}
                          fill='#8884d8'
                          dataKey='value'
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {resourceTypeData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className='flex justify-center items-center h-full'>
                      <p className='text-muted-foreground'>
                        No resource data available
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reservations</CardTitle>
                <CardDescription>Total: {reservations.length}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='h-[300px]'>
                  {reservationStatusData.length > 0 ? (
                    <ResponsiveContainer width='100%' height='100%'>
                      <PieChart>
                        <Pie
                          data={reservationStatusData}
                          cx='50%'
                          cy='50%'
                          labelLine={true}
                          outerRadius={80}
                          fill='#8884d8'
                          dataKey='value'
                          label={({ name, percent }) =>
                            `${name}: ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {reservationStatusData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className='flex justify-center items-center h-full'>
                      <p className='text-muted-foreground'>
                        No reservation data available
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Reservations</CardTitle>
              <CardDescription>Last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[300px]'>
                {monthlyReservationsData.length > 0 ? (
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={monthlyReservationsData}>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis dataKey='name' />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey='count' fill='#8884d8' name='Reservations' />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className='flex justify-center items-center h-full'>
                    <p className='text-muted-foreground'>
                      No monthly data available
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='resources' className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>Resource Types</CardTitle>
              <CardDescription>Distribution by type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[300px]'>
                {resourceTypeData.length > 0 ? (
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={resourceTypeData} layout='vertical'>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis type='number' />
                      <YAxis dataKey='name' type='category' width={150} />
                      <Tooltip />
                      <Bar dataKey='value' fill='#8884d8' name='Count' />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className='flex justify-center items-center h-full'>
                    <p className='text-muted-foreground'>
                      No resource type data available
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Methods</CardTitle>
              <CardDescription>Distribution by access method</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[300px]'>
                {accessMethodData.length > 0 ? (
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={accessMethodData} layout='vertical'>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis type='number' />
                      <YAxis dataKey='name' type='category' width={150} />
                      <Tooltip />
                      <Bar dataKey='value' fill='#00C49F' name='Count' />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className='flex justify-center items-center h-full'>
                    <p className='text-muted-foreground'>
                      No access method data available
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='reservations' className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>Reservation Status</CardTitle>
              <CardDescription>Distribution by status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[300px]'>
                {reservationStatusData.length > 0 ? (
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={reservationStatusData} layout='vertical'>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis type='number' />
                      <YAxis dataKey='name' type='category' width={150} />
                      <Tooltip />
                      <Bar dataKey='value' fill='#FFBB28' name='Count' />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className='flex justify-center items-center h-full'>
                    <p className='text-muted-foreground'>
                      No reservation status data available
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Trend</CardTitle>
              <CardDescription>Reservations over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='h-[300px]'>
                {monthlyReservationsData.length > 0 ? (
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={monthlyReservationsData}>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis dataKey='name' />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey='count' fill='#FF8042' name='Reservations' />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className='flex justify-center items-center h-full'>
                    <p className='text-muted-foreground'>
                      No monthly data available
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
