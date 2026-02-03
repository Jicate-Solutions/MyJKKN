import { Shield, Activity, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function SAMLAdminDashboard() {
  const supabase = await createClient();

  // Fetch statistics
  const [spCountResult, sessionCountResult] = await Promise.all([
    supabase
      .from('saml_service_providers')
      .select('id', { count: 'exact', head: true })
      .eq('active', true),
    supabase
      .from('saml_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('expired', false)
  ]);

  const activeSpCount = spCountResult.count ?? 0;
  const activeSessionCount = sessionCountResult.count ?? 0;

  // Get IdP configuration
  const idpEntityId = process.env.SAML_IDP_ENTITY_ID || 'https://myjkkn.com/saml/metadata';
  const ssoEndpoint = `${process.env.NEXT_PUBLIC_APP_URL}/api/saml/sso/login`;
  const metadataUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/saml/metadata`;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">SAML Identity Provider</h1>
        <p className="text-muted-foreground">
          Manage SAML 2.0 integrations and view system statistics
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Service Providers
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSpCount}</div>
            <p className="text-xs text-muted-foreground">
              Configured SAML integrations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Sessions
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSessionCount}</div>
            <p className="text-xs text-muted-foreground">
              Current SAML sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              IdP Metadata
            </CardTitle>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <Link href={metadataUrl} target="_blank">
                View Metadata
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Download IdP configuration
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Management Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Service Providers</CardTitle>
            <CardDescription>
              Manage SAML service provider integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/admin/saml/service-providers">
                Manage Service Providers
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              View IdP configuration details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">Entity ID</div>
              <code className="text-xs bg-muted p-2 rounded block break-all">
                {idpEntityId}
              </code>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">SSO Endpoint</div>
              <code className="text-xs bg-muted p-2 rounded block break-all">
                {ssoEndpoint}
              </code>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Metadata URL</div>
              <code className="text-xs bg-muted p-2 rounded block break-all">
                {metadataUrl}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
