'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import { use } from 'react';
import {
  ArrowLeft,
  Globe,
  Mail,
  Phone,
  Clock,
  Calendar,
  Tag,
  Shield,
  User,
  Laptop
} from 'lucide-react';
import BeatLoader from 'react-spinners/BeatLoader';

import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Application } from '@/types/applications';

interface ApplicationDetailsPageProps {
  params: Promise<{
    applicationId: string;
  }>;
}

export default function ApplicationDetailsPage({
  params
}: ApplicationDetailsPageProps) {
  const resolvedParams = use(params);
  const applicationId = resolvedParams.applicationId;
  
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApplication = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (error) throw error;
      setApplication(data);
    } catch (error) {
      console.error('Error fetching application:', error);
      toast.error('Failed to load application details');
      router.push('/applications');
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, router, supabase]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Application not found</h2>
          <p className="text-muted-foreground mt-1">
            The application you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/applications')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={application.name}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/applications">Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 p-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => router.push(`/applications/${applicationId}/edit`)}
          >
            Edit Application
          </Button>
        </div>

        {/* Main Details Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{application.name}</CardTitle>
                <p className="text-muted-foreground mt-1">
                  {application.description}
                </p>
              </div>
              <Badge
                variant={application.is_active ? "default" : "secondary"}
              >
                {application.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold">Basic Information</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 mr-2 text-muted-foreground" />
                    <Link
                      href={application.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {application.url}
                    </Link>
                  </div>
                  <div className="flex items-center">
                    <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>
                      {application.tags.length > 0
                        ? application.tags.join(", ")
                        : "No tags"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div className="space-y-4">
                <h3 className="font-semibold">Technical Details</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>Integration: {application.integration_type}</span>
                  </div>
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>Auth: {application.authentication_method}</span>
                  </div>
                  <div className="flex items-center">
                    <Laptop className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>Platform: {application.supported_platforms}</span>
                  </div>
                </div>
              </div>

              {/* Support Contact */}
              <div className="space-y-4">
                <h3 className="font-semibold">Support Contact</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{application.support_contact.name}</span>
                  </div>
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                    <Link
                      href={`mailto:${application.support_contact.email}`}
                      className="text-primary hover:underline"
                    >
                      {application.support_contact.email}
                    </Link>
                  </div>
                  {application.support_contact.phone && (
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span>{application.support_contact.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Details */}
              <div className="space-y-4">
                <h3 className="font-semibold">Additional Details</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>Created: {new Date(application.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>Last Updated: {new Date(application.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Endpoints Card (if applicable) */}
        {application.api_endpoints && application.api_endpoints.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {application.api_endpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className="p-4 border rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{endpoint.name}</h4>
                      <Badge>{endpoint.method}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {endpoint.endpoint}
                    </p>
                    {endpoint.description && (
                      <p className="text-sm mt-2">{endpoint.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}