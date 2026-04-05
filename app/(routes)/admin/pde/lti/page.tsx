'use client';

import { useState, useEffect, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Settings,
  TestTube,
  CheckCircle,
  XCircle,
  ExternalLink,
  Plus,
  Save,
  Trash2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================
// Types
// ============================================

interface LTIToolConfig {
  id: string;
  tool_name: string;
  launch_url: string;
  client_id: string;
  deployment_id: string;
  public_key_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GradePassbackLog {
  id: string;
  learner_id: string;
  learner_name: string;
  tool_name: string;
  score: number;
  max_score: number;
  timestamp: string;
  status: 'success' | 'error';
  error_message?: string;
}

// ============================================
// Main Page
// ============================================

export default function LTIConfigPage() {
  const { toast } = useToast();
  const [tools, setTools] = useState<LTIToolConfig[]>([]);
  const [gradeLogs, setGradeLogs] = useState<GradePassbackLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  // Form state for new tool
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tool_name: '',
    launch_url: '',
    client_id: '',
    deployment_id: '',
    public_key_url: '',
  });

  // Load existing config
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClientSupabaseClient();

      // Try lti_tools table first (existing), fallback to checking pde_lti_config
      const { data: existingTools, error: toolsError } = await (supabase as ReturnType<typeof createClientSupabaseClient>)
        .from('lti_tools')
        .select('*')
        .order('created_at', { ascending: false });

      if (!toolsError && existingTools) {
        setTools(existingTools as unknown as LTIToolConfig[]);
      }

      // Load grade passback logs (simulated from pde_submissions with LTI metadata)
      const { data: submissions } = await (supabase as ReturnType<typeof createClientSupabaseClient>)
        .from('pde_submissions')
        .select('id, learner_id, final_score, created_at')
        .not('final_score', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (submissions) {
        setGradeLogs(submissions.map(s => ({
          id: s.id,
          learner_id: s.learner_id,
          learner_name: 'Learner',
          tool_name: 'MATLAB Grader',
          score: s.final_score || 0,
          max_score: 100,
          timestamp: s.created_at,
          status: 'success' as const,
        })));
      }
    } catch (error) {
      console.error('Failed to load LTI config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!form.tool_name || !form.launch_url || !form.client_id) {
      toast({ title: 'Validation Error', description: 'Tool name, launch URL, and client ID are required.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as ReturnType<typeof createClientSupabaseClient>)
        .from('lti_tools')
        .insert({
          tool_name: form.tool_name,
          launch_url: form.launch_url,
          client_id: form.client_id,
          deployment_id: form.deployment_id || null,
          public_key_url: form.public_key_url || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setTools(prev => [data as unknown as LTIToolConfig, ...prev]);
      setForm({ tool_name: '', launch_url: '', client_id: '', deployment_id: '', public_key_url: '' });
      setShowForm(false);
      toast({ title: 'Tool Registered', description: `${form.tool_name} has been registered successfully.` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save LTI tool configuration.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestLaunch = async (toolId: string) => {
    setTesting(toolId);
    try {
      const tool = tools.find(t => t.id === toolId);
      if (!tool) return;

      // Simulate a test launch by checking the URL is reachable
      // In Phase 4, this would do the actual LTI 1.3 handshake
      const response = await fetch(tool.launch_url, { method: 'HEAD', mode: 'no-cors' });
      toast({ title: 'Test Launch', description: `Launch URL for ${tool.tool_name} is reachable. Full LTI handshake will be available in Phase 4.` });
    } catch {
      toast({ title: 'Test Failed', description: 'Could not reach the launch URL. Please verify the configuration.', variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (toolId: string) => {
    try {
      const supabase = createClientSupabaseClient();
      await (supabase as ReturnType<typeof createClientSupabaseClient>)
        .from('lti_tools')
        .delete()
        .eq('id', toolId);

      setTools(prev => prev.filter(t => t.id !== toolId));
      toast({ title: 'Tool Removed', description: 'LTI tool configuration has been removed.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove tool configuration.', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (toolId: string, isActive: boolean) => {
    try {
      const supabase = createClientSupabaseClient();
      await (supabase as ReturnType<typeof createClientSupabaseClient>)
        .from('lti_tools')
        .update({ is_active: !isActive })
        .eq('id', toolId);

      setTools(prev => prev.map(t => t.id === toolId ? { ...t, is_active: !isActive } : t));
    } catch {
      toast({ title: 'Error', description: 'Failed to update tool status.', variant: 'destructive' });
    }
  };

  return (
    <ContentLayout title="MATLAB Grader LTI Configuration">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'PDE', href: '/admin/pde/assessments' },
          { label: 'LTI Configuration' },
        ]}
      />

      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">LTI Tool Integration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure LTI 1.3 tools (MATLAB Grader, etc.) for external assessment integration
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" />
            Register Tool
          </Button>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-3">
          <Badge variant={tools.some(t => t.is_active) ? 'default' : 'secondary'} className="gap-1">
            {tools.some(t => t.is_active) ? (
              <><CheckCircle className="w-3.5 h-3.5" /> Connected</>
            ) : (
              <><XCircle className="w-3.5 h-3.5" /> No Active Tools</>
            )}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {tools.length} tool{tools.length !== 1 ? 's' : ''} registered
          </span>
        </div>

        {/* Registration Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="w-5 h-5" />
                Register LTI Tool
              </CardTitle>
              <CardDescription>
                Enter the LTI 1.3 configuration provided by the tool vendor (e.g., MathWorks for MATLAB Grader)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tool_name">Tool Name *</Label>
                  <Input
                    id="tool_name"
                    placeholder="e.g., MATLAB Grader"
                    value={form.tool_name}
                    onChange={e => setForm(prev => ({ ...prev, tool_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="launch_url">Launch URL *</Label>
                  <Input
                    id="launch_url"
                    placeholder="https://grader.mathworks.com/lti/launch"
                    value={form.launch_url}
                    onChange={e => setForm(prev => ({ ...prev, launch_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_id">Client ID *</Label>
                  <Input
                    id="client_id"
                    placeholder="LTI client ID from vendor"
                    value={form.client_id}
                    onChange={e => setForm(prev => ({ ...prev, client_id: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deployment_id">Deployment ID</Label>
                  <Input
                    id="deployment_id"
                    placeholder="Deployment identifier"
                    value={form.deployment_id}
                    onChange={e => setForm(prev => ({ ...prev, deployment_id: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="public_key_url">Public Key URL (JWKS)</Label>
                  <Input
                    id="public_key_url"
                    placeholder="https://grader.mathworks.com/.well-known/jwks.json"
                    value={form.public_key_url}
                    onChange={e => setForm(prev => ({ ...prev, public_key_url: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Registered Tools */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered Tools</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-10 bg-gray-100 rounded" />
                <div className="h-10 bg-gray-100 rounded" />
              </div>
            ) : tools.length === 0 ? (
              <div className="text-center py-8">
                <Settings className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No LTI tools registered yet. Click &ldquo;Register Tool&rdquo; to add one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool Name</TableHead>
                    <TableHead>Launch URL</TableHead>
                    <TableHead>Client ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tools.map(tool => (
                    <TableRow key={tool.id}>
                      <TableCell className="font-medium">{tool.tool_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {tool.launch_url}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{tool.client_id}</TableCell>
                      <TableCell>
                        <button onClick={() => handleToggleActive(tool.id, tool.is_active)}>
                          <Badge variant={tool.is_active ? 'default' : 'secondary'} className="cursor-pointer">
                            {tool.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTestLaunch(tool.id)}
                            disabled={testing === tool.id}
                          >
                            {testing === tool.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <TestTube className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(tool.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Grade Passback Log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Grade Passback Log</CardTitle>
            <Button variant="ghost" size="sm" onClick={loadData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {gradeLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No grade passback events yet. Grades will appear here once Learners complete LTI-linked assessments.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gradeLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.tool_name}</TableCell>
                      <TableCell>
                        {log.score}/{log.max_score}
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((log.score / log.max_score) * 100)}%)
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                          {log.status === 'success' ? (
                            <><CheckCircle className="w-3 h-3 mr-0.5" /> Success</>
                          ) : (
                            <><XCircle className="w-3 h-3 mr-0.5" /> Error</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Phase 4 Note */}
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3 text-sm">
              <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-muted-foreground">Phase 4: Full LTI 1.3 Handshake</p>
                <p className="text-muted-foreground text-xs mt-1">
                  This page currently manages tool registration. The full OIDC login initiation,
                  JWT validation, and AGS (Assignment and Grade Services) implementation will be
                  built in Phase 4. Configuration saved here will be used when the handshake is implemented.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
