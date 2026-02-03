import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, BookOpen, Award, FileText, ExternalLink, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export const metadata: Metadata = {
  title: 'Publications | Solutions Hub',
  description: 'Track publications for NIRF/NAAC accreditation',
};

export default function PublicationsPage() {
  // Placeholder data
  const publications = [
    {
      id: '1',
      title: 'AI-Powered Student Portal: A Case Study',
      paper_type: 'journal',
      journal_name: 'International Journal of Educational Technology',
      journal_type: 'scopus',
      authors: ['Dr. John Smith', 'Prof. Kumar'],
      solution: { code: 'JKKN-SOL-2026-001', title: 'Student Portal' },
      status: 'published',
      publication_date: '2026-01-15',
      doi: '10.1234/ijet.2026.001',
      nirf_category: 'Research Publications',
      naac_criterion: 'III - Research',
    },
    {
      id: '2',
      title: 'Machine Learning for HR Analytics',
      paper_type: 'conference',
      journal_name: 'IEEE Conference on AI',
      journal_type: 'wos',
      authors: ['Ms. Sarah Johnson'],
      solution: { code: 'JKKN-SOL-2026-002', title: 'HR System' },
      status: 'accepted',
      publication_date: null,
      doi: null,
      nirf_category: 'Conference Papers',
      naac_criterion: 'III - Research',
    },
    {
      id: '3',
      title: 'Digital Content Production Framework',
      paper_type: 'case_study',
      journal_name: 'Harvard Business Review',
      journal_type: 'other',
      authors: ['Prof. Kumar', 'Dr. Jane Doe'],
      solution: { code: 'JKKN-SOL-2026-003', title: 'Marketing Package' },
      status: 'submitted',
      publication_date: null,
      doi: null,
      nirf_category: null,
      naac_criterion: 'III - Research',
    },
  ];

  const stats = {
    total: publications.length,
    published: publications.filter((p) => p.status === 'published').length,
    scopus: publications.filter((p) => p.journal_type === 'scopus').length,
    wos: publications.filter((p) => p.journal_type === 'wos').length,
  };

  const paperTypeConfig: Record<string, { label: string; color: string }> = {
    journal: { label: 'Journal', color: 'bg-blue-100 text-blue-800' },
    conference: { label: 'Conference', color: 'bg-green-100 text-green-800' },
    patent: { label: 'Patent', color: 'bg-purple-100 text-purple-800' },
    book_chapter: { label: 'Book Chapter', color: 'bg-orange-100 text-orange-800' },
    case_study: { label: 'Case Study', color: 'bg-teal-100 text-teal-800' },
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'outline' },
    submitted: { label: 'Submitted', variant: 'secondary' },
    under_review: { label: 'Under Review', variant: 'secondary' },
    accepted: { label: 'Accepted', variant: 'default' },
    published: { label: 'Published', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'outline' },
  };

  const journalTypeConfig: Record<string, string> = {
    scopus: 'Scopus',
    wos: 'Web of Science',
    ugc: 'UGC',
    other: 'Other',
  };

  return (
    <ContentLayout title="Publications">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Publications' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Publications</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Research publications for NIRF/NAAC accreditation
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Publication
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Publications</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Award className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.published}</p>
                <p className="text-sm text-muted-foreground">Published</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.scopus}</p>
                <p className="text-sm text-muted-foreground">Scopus Indexed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.wos}</p>
                <p className="text-sm text-muted-foreground">WoS Indexed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Publications Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {publications.map((pub) => {
            const paperType = paperTypeConfig[pub.paper_type];
            const status = statusConfig[pub.status];

            return (
              <Card key={pub.id}>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={paperType.color}>{paperType.label}</Badge>
                      <Badge variant="outline">{journalTypeConfig[pub.journal_type]}</Badge>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <CardTitle className="text-lg">{pub.title}</CardTitle>
                  <CardDescription>{pub.journal_name}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Authors</p>
                    <p className="text-sm">{pub.authors.join(', ')}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {pub.solution.code} - {pub.solution.title}
                    </span>
                    {pub.publication_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(pub.publication_date), 'MMM yyyy')}
                      </span>
                    )}
                  </div>
                  {pub.doi && (
                    <a
                      href={`https://doi.org/${pub.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      DOI: {pub.doi}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <div className="flex gap-2 text-xs">
                    {pub.nirf_category && (
                      <Badge variant="outline" className="text-xs">
                        NIRF: {pub.nirf_category}
                      </Badge>
                    )}
                    {pub.naac_criterion && (
                      <Badge variant="outline" className="text-xs">
                        NAAC: {pub.naac_criterion}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
