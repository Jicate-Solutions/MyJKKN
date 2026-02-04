'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import {
  Save,
  ArrowLeft,
  BookOpen,
  Users,
  Calendar
} from 'lucide-react';

export default function NewPublicationPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      router.push('/solutions/publications');
    }, 1000);
  };

  return (
    <ContentLayout title="Add Publication">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Publications', href: '/solutions/publications' },
          { label: 'New Publication' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add Publication</h1>
            <p className="text-sm text-muted-foreground">
              Add a new publication or research output
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Publication Details */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Publication Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Publication title"
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="type">Publication Type *</Label>
                    <select id="type" className="w-full rounded-md border p-2" required>
                      <option value="">Select type</option>
                      <option value="journal">Journal Article</option>
                      <option value="conference">Conference Paper</option>
                      <option value="book">Book</option>
                      <option value="book_chapter">Book Chapter</option>
                      <option value="patent">Patent</option>
                      <option value="whitepaper">White Paper</option>
                      <option value="case_study">Case Study</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status *</Label>
                    <select id="status" className="w-full rounded-md border p-2" required>
                      <option value="">Select status</option>
                      <option value="draft">Draft</option>
                      <option value="submitted">Submitted</option>
                      <option value="under_review">Under Review</option>
                      <option value="accepted">Accepted</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="abstract">Abstract</Label>
                  <Textarea
                    id="abstract"
                    placeholder="Brief summary of the publication"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Authors & Contributors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Authors & Contributors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="authors">Authors *</Label>
                  <Textarea
                    id="authors"
                    placeholder="List authors, one per line"
                    rows={4}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="corresponding">Corresponding Author</Label>
                  <Input
                    id="corresponding"
                    placeholder="Email of corresponding author"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="affiliations">Affiliations</Label>
                  <Textarea
                    id="affiliations"
                    placeholder="List affiliations"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Publication Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Publication Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="journal">Journal / Conference / Publisher</Label>
                  <Input
                    id="journal"
                    placeholder="Name of journal or publisher"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="volume">Volume / Issue</Label>
                    <Input
                      id="volume"
                      placeholder="e.g., Vol. 5, Issue 2"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pages">Pages</Label>
                    <Input
                      id="pages"
                      placeholder="e.g., 123-145"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="doi">DOI / URL</Label>
                  <Input
                    id="doi"
                    placeholder="https://doi.org/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pub_date">Publication Date</Label>
                  <Input
                    id="pub_date"
                    type="date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keywords">Keywords</Label>
                  <Input
                    id="keywords"
                    placeholder="Comma-separated keywords"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Saving...' : 'Save Publication'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
