import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import {
  MessageSquare,
  Star,
  Send,
  CheckCircle,
  Clock
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Feedback | Parent Portal',
  description: 'Share feedback and suggestions about your child\'s education',
};

export default async function ParentFeedbackPage() {
  const { profile } = await getEnhancedUserProfile();

  if (!profile?.institution_id) {
    redirect('/');
  }

  // Placeholder feedback history
  const feedbackHistory = [
    {
      id: '1',
      subject: 'Excellent Academic Support',
      type: 'appreciation',
      status: 'acknowledged',
      date: '2026-02-01',
      response: 'Thank you for your kind words. We are committed to providing the best education.',
    },
    {
      id: '2',
      subject: 'Request for Extra Tutoring',
      type: 'suggestion',
      status: 'in_progress',
      date: '2026-01-25',
      response: 'We are reviewing your request and will get back to you shortly.',
    },
    {
      id: '3',
      subject: 'Library Hours Extension',
      type: 'suggestion',
      status: 'resolved',
      date: '2026-01-15',
      response: 'Library hours have been extended to 8 PM on weekdays.',
    },
  ];

  return (
    <ContentLayout title="Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
          { label: 'Feedback' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Parent Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Share your feedback, suggestions, or appreciation
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Submitted</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{feedbackHistory.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {feedbackHistory.filter(f => f.status === 'resolved' || f.status === 'acknowledged').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {feedbackHistory.filter(f => f.status === 'in_progress').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit New Feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Submit New Feedback
            </CardTitle>
            <CardDescription>
              Share your thoughts, suggestions, or appreciation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Feedback Type</label>
                <select className="mt-1 w-full rounded-md border p-2">
                  <option value="suggestion">Suggestion</option>
                  <option value="appreciation">Appreciation</option>
                  <option value="concern">Concern</option>
                  <option value="query">Query</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Related To</label>
                <select className="mt-1 w-full rounded-md border p-2">
                  <option value="academics">Academics</option>
                  <option value="facilities">Facilities</option>
                  <option value="administration">Administration</option>
                  <option value="faculty">Faculty</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Subject</label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border p-2"
                placeholder="Brief subject of your feedback"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Your Feedback</label>
              <Textarea
                className="mt-1"
                placeholder="Please share your detailed feedback..."
                rows={4}
              />
            </div>

            <Button>
              <Send className="mr-2 h-4 w-4" />
              Submit Feedback
            </Button>
          </CardContent>
        </Card>

        {/* Feedback History */}
        <Card>
          <CardHeader>
            <CardTitle>Your Feedback History</CardTitle>
            <CardDescription>Track the status of your previous feedback</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {feedbackHistory.map((feedback) => (
                <div key={feedback.id} className="p-4 rounded-lg border">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{feedback.subject}</span>
                        <Badge variant="outline">{feedback.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{feedback.date}</p>
                    </div>
                    <Badge
                      className={
                        feedback.status === 'resolved' || feedback.status === 'acknowledged'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }
                    >
                      {feedback.status}
                    </Badge>
                  </div>
                  {feedback.response && (
                    <div className="mt-3 p-3 rounded bg-muted">
                      <p className="text-sm font-medium mb-1">Response:</p>
                      <p className="text-sm text-muted-foreground">{feedback.response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
