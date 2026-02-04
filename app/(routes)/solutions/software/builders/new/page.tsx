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
  User,
  Code,
  Briefcase
} from 'lucide-react';

export default function NewBuilderPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      router.push('/solutions/software/builders');
    }, 1000);
  };

  return (
    <ContentLayout title="Add Builder">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Builders', href: '/solutions/software/builders' },
          { label: 'New Builder' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add New Builder</h1>
            <p className="text-sm text-muted-foreground">
              Add a developer/builder to the software solutions team
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Personal Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Builder Type *</Label>
                  <select id="type" className="w-full rounded-md border p-2" required>
                    <option value="">Select type</option>
                    <option value="internal">Internal (Employee)</option>
                    <option value="contractor">Contractor</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Technical Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Technical Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Primary Role *</Label>
                  <select id="role" className="w-full rounded-md border p-2" required>
                    <option value="">Select role</option>
                    <option value="frontend">Frontend Developer</option>
                    <option value="backend">Backend Developer</option>
                    <option value="fullstack">Full Stack Developer</option>
                    <option value="mobile">Mobile Developer</option>
                    <option value="devops">DevOps Engineer</option>
                    <option value="qa">QA Engineer</option>
                    <option value="design">UI/UX Designer</option>
                    <option value="pm">Project Manager</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="level">Experience Level *</Label>
                  <select id="level" className="w-full rounded-md border p-2" required>
                    <option value="">Select level</option>
                    <option value="junior">Junior (0-2 years)</option>
                    <option value="mid">Mid-level (2-5 years)</option>
                    <option value="senior">Senior (5-8 years)</option>
                    <option value="lead">Tech Lead (8+ years)</option>
                    <option value="architect">Architect (10+ years)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills">Technical Skills</Label>
                  <Textarea
                    id="skills"
                    placeholder="List skills (e.g., React, Node.js, TypeScript, PostgreSQL)"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="certifications">Certifications</Label>
                  <Input
                    id="certifications"
                    placeholder="e.g., AWS Certified, Google Cloud"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Work Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Work Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="availability">Availability *</Label>
                  <select id="availability" className="w-full rounded-md border p-2" required>
                    <option value="">Select availability</option>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract Based</option>
                    <option value="freelance">Freelance/Project Based</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hours">Hours per Week</Label>
                  <Input
                    id="hours"
                    type="number"
                    placeholder="e.g., 40"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate">Rate (₹/hour or ₹/month)</Label>
                  <Input
                    id="rate"
                    placeholder="Enter rate"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Additional Info */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="portfolio">Portfolio / GitHub URL</Label>
                  <Input
                    id="portfolio"
                    placeholder="https://github.com/username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn Profile</Label>
                  <Input
                    id="linkedin"
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes about this builder"
                    rows={3}
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
              {isSubmitting ? 'Adding...' : 'Add Builder'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
