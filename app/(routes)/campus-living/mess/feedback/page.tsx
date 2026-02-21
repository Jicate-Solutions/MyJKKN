'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Star,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { useState } from 'react';

export default function MessFeedbackPage() {
  const [mealFilter, setMealFilter] = useState('all');

  // TODO: Replace with actual hook
  // const { data: feedback, isLoading } = useMessFeedback();

  const ratingsSummary = {
    overall: 3.8,
    food_quality: 3.9,
    hygiene: 4.1,
    variety: 3.5,
    service: 3.7,
    total_responses: 156,
  };

  const recentFeedback = [
    { id: '1', student: 'Arun Kumar', meal: 'Lunch', rating: 4, comment: 'Good quality food today. Paneer was fresh.', date: '2026-02-21', type: 'positive' },
    { id: '2', student: 'Priya Sharma', meal: 'Dinner', rating: 2, comment: 'Rice was undercooked. Need improvement.', date: '2026-02-21', type: 'complaint' },
    { id: '3', student: 'Rahul Patel', meal: 'Breakfast', rating: 5, comment: 'Excellent dosa and sambar. Keep it up!', date: '2026-02-20', type: 'positive' },
    { id: '4', student: 'Sneha Reddy', meal: 'Lunch', rating: 1, comment: 'Found hair in the food. Very unhygienic.', date: '2026-02-20', type: 'complaint' },
    { id: '5', student: 'Vikram Singh', meal: 'Dinner', rating: 3, comment: 'Average food. Needs more variety.', date: '2026-02-19', type: 'neutral' },
  ];

  const complaints = recentFeedback.filter((f) => f.type === 'complaint');

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <ContentLayout title="Mess Feedback">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Feedback & Ratings</h1>
            <p className="text-muted-foreground">
              Student feedback, ratings, and complaint tracking
            </p>
          </div>
          <Select value={mealFilter} onValueChange={setMealFilter}>
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

        {/* Ratings Overview */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Overall</p>
              <p className="text-2xl font-bold">{ratingsSummary.overall}</p>
              {renderStars(Math.round(ratingsSummary.overall))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Food Quality</p>
              <p className="text-2xl font-bold">{ratingsSummary.food_quality}</p>
              {renderStars(Math.round(ratingsSummary.food_quality))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Hygiene</p>
              <p className="text-2xl font-bold">{ratingsSummary.hygiene}</p>
              {renderStars(Math.round(ratingsSummary.hygiene))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Variety</p>
              <p className="text-2xl font-bold">{ratingsSummary.variety}</p>
              {renderStars(Math.round(ratingsSummary.variety))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Service</p>
              <p className="text-2xl font-bold">{ratingsSummary.service}</p>
              {renderStars(Math.round(ratingsSummary.service))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Reviews</p>
              <p className="text-2xl font-bold">{ratingsSummary.total_responses}</p>
              <p className="text-xs text-muted-foreground">this week</p>
            </CardContent>
          </Card>
        </div>

        {/* Rating Distribution Chart Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Rating Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = recentFeedback.filter((f) => f.rating === star).length;
                const percentage = (count / recentFeedback.length) * 100;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-8">{star} star</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-yellow-500 rounded-full h-3"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {Math.round(percentage)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tabs for feedback/complaints */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              All Feedback ({recentFeedback.length})
            </TabsTrigger>
            <TabsTrigger value="complaints">
              Complaints ({complaints.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {recentFeedback.map((fb) => (
              <Card key={fb.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {fb.type === 'positive' ? (
                          <ThumbsUp className="h-5 w-5 text-green-600" />
                        ) : fb.type === 'complaint' ? (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        ) : (
                          <MessageSquare className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{fb.student}</span>
                          <Badge variant="outline" className="text-xs">{fb.meal}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{fb.comment}</p>
                        <div className="flex items-center gap-3">
                          {renderStars(fb.rating)}
                          <span className="text-xs text-muted-foreground">{fb.date}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="complaints" className="space-y-4">
            {complaints.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No complaints to show
                </CardContent>
              </Card>
            ) : (
              complaints.map((fb) => (
                <Card key={fb.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 mt-1" />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{fb.student}</span>
                            <Badge variant="outline" className="text-xs">{fb.meal}</Badge>
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">Complaint</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{fb.comment}</p>
                          <span className="text-xs text-muted-foreground">{fb.date}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Respond</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
