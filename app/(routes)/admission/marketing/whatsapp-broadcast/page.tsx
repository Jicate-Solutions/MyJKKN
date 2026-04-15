'use client';

import { useState, useCallback, useRef } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
// Select used for future scheduled_at time picker
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useWhatsAppBroadcastCampaigns,
  useApprovedTemplates,
  useUploadContacts,
  useSendBroadcast,
  type ParsedContact,
  type BroadcastCampaign,
  type ApprovedTemplate,
} from '@/hooks/admission/use-whatsapp-broadcast';
import {
  MessageSquare, Upload, Send, RefreshCw, Loader2, TrendingUp,
  CheckCircle, Eye, FileSpreadsheet, ChevronRight,
  ArrowLeft, Megaphone, BarChart3,
} from 'lucide-react';

// =============================================================================
// Stats Card
// =============================================================================

function StatsCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Campaign List
// =============================================================================

function CampaignList({ campaigns, isLoading }: { campaigns: BroadcastCampaign[]; isLoading: boolean }) {
  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p>No broadcast campaigns yet</p>
        <p className="text-sm mt-1">Create your first WhatsApp broadcast above</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaign</TableHead>
          <TableHead>Template</TableHead>
          <TableHead className="text-center">Total</TableHead>
          <TableHead className="text-center">Sent</TableHead>
          <TableHead className="text-center">Delivered</TableHead>
          <TableHead className="text-center">Read</TableHead>
          <TableHead className="text-center">Failed</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((c) => {
          const deliveryRate = c.total > 0 ? Math.round(((c.delivered + c.read) / c.total) * 100) : 0;
          return (
            <TableRow key={c.campaign_id}>
              <TableCell>
                <div>
                  <p className="font-medium">{c.campaign_name}</p>
                  <p className="text-xs text-muted-foreground">{c.campaign_id.slice(0, 8)}...</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{c.template_name || '—'}</Badge>
              </TableCell>
              <TableCell className="text-center font-medium">{c.total}</TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary" className="text-xs">{c.sent}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge className="text-xs bg-blue-100 text-blue-800">{c.delivered}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge className="text-xs bg-green-100 text-green-800">{c.read}</Badge>
              </TableCell>
              <TableCell className="text-center">
                {c.failed > 0 ? (
                  <Badge variant="destructive" className="text-xs">{c.failed}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
                <Progress value={deliveryRate} className="h-1 mt-1 w-16" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// =============================================================================
// CSV Parser (client-side)
// =============================================================================

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

// =============================================================================
// New Campaign Wizard
// =============================================================================

function NewCampaignWizard({
  institutionId,
  templates,
  onComplete,
}: {
  institutionId: string;
  templates: ApprovedTemplate[];
  onComplete: () => void;
}) {
  const [step, setStep] = useState(1);
  const [campaignName, setCampaignName] = useState('');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [uploadStats, setUploadStats] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ApprovedTemplate | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadContacts();
  const sendMutation = useSendBroadcast();
  const { canAccess } = usePermissions();
  const canSendBroadcast = canAccess('admission', 'edit')
    || canAccess('admission', 'manage');

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return;
    }

    uploadMutation.mutate({ rows }, {
      onSuccess: (result) => {
        setContacts(result.contacts);
        setUploadStats({ total: result.total, valid: result.valid_count, invalid: result.invalid_count });
        setCampaignName(file.name.replace(/\.\w+$/, ''));
      },
    });
  }, [uploadMutation]);

  const handleSend = () => {
    if (!selectedTemplate || contacts.length === 0) return;

    sendMutation.mutate({
      institution_id: institutionId,
      campaign_name: campaignName || `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
      template_name: selectedTemplate.name,
      recipients: contacts.map(c => ({
        phone: c.phone,
        variables: c.variables,
      })),
    }, {
      onSuccess: () => {
        setShowConfirm(false);
        onComplete();
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-green-600 text-white' : step > s ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
            }`}>
              {step > s ? <CheckCircle className="h-4 w-4" /> : s}
            </div>
            <span className={step === s ? 'font-medium' : 'text-muted-foreground'}>
              {s === 1 ? 'Upload Contacts' : s === 2 ? 'Select Template' : 'Review & Send'}
            </span>
            {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Contacts
            </CardTitle>
            <CardDescription>
              Upload a CSV file with phone numbers. The file should have a column named &quot;phone&quot;, &quot;mobile&quot;, or &quot;number&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Campaign Name</Label>
              <Input
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="e.g., April Fee Reminder"
                className="mt-1"
              />
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-green-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Click to upload CSV</p>
              <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {uploadMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Parsing contacts...
              </div>
            )}

            {uploadStats && (
              <div className="flex gap-4">
                <Badge variant="outline" className="text-sm">Total: {uploadStats.total}</Badge>
                <Badge className="text-sm bg-green-100 text-green-800">Valid: {uploadStats.valid}</Badge>
                {uploadStats.invalid > 0 && (
                  <Badge variant="destructive" className="text-sm">Invalid: {uploadStats.invalid}</Badge>
                )}
              </div>
            )}

            {contacts.length > 0 && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Variables</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.slice(0, 5).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                        <TableCell>{c.name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {Object.entries(c.variables).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {contacts.length > 5 && (
                  <p className="text-xs text-muted-foreground">...and {contacts.length - 5} more contacts</p>
                )}

                <Button onClick={() => setStep(2)} className="w-full">
                  Continue with {contacts.length} contacts <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Template */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Select Template
                </CardTitle>
                <CardDescription>Choose an approved Meta template for this broadcast</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-green-500 ${
                    selectedTemplate?.id === t.id ? 'border-green-600 bg-green-50 dark:bg-green-950' : ''
                  }`}
                  onClick={() => setSelectedTemplate(t)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">{t.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {t.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.language?.toUpperCase()}</p>
                </div>
              ))}
            </div>

            {templates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No approved templates found</p>
                <p className="text-sm mt-1">Create templates in Meta Business Manager first</p>
              </div>
            )}

            {selectedTemplate && (
              <Button onClick={() => setStep(3)} className="w-full">
                Use &quot;{selectedTemplate.name}&quot; <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review & Send */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Review & Send
                </CardTitle>
                <CardDescription>Confirm your broadcast details before sending</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Campaign</p>
                <p className="font-medium">{campaignName || 'Untitled'}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Template</p>
                <p className="font-medium">{selectedTemplate?.name}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Recipients</p>
                <p className="font-medium">{contacts.length} contacts</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-medium">{selectedTemplate?.category}</p>
              </div>
            </div>

            <div className="flex gap-3">
              {canSendBroadcast ? (
                <Button onClick={() => setShowConfirm(true)} className="flex-1" size="lg">
                  <Send className="h-4 w-4 mr-2" /> Send Now
                </Button>
              ) : (
                <p className="flex-1 text-sm text-muted-foreground">
                  You don&apos;t have permission to send broadcasts.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Broadcast</DialogTitle>
            <DialogDescription>
              This will send &quot;{selectedTemplate?.name}&quot; to {contacts.length} contacts via WhatsApp.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sendMutation.isPending || !canSendBroadcast}>
              {sendMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Send to {contacts.length} contacts</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

function WhatsAppBroadcastContent() {
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || profile?.institution_id || '';
  const [activeTab, setActiveTab] = useState('campaigns');

  const { campaigns, stats, isLoading, refetch } = useWhatsAppBroadcastCampaigns(institutionId);
  const { data: templates } = useApprovedTemplates(institutionId);

  return (
    <PermissionGuard module="admission" action="manage">
      <ContentLayout title="WhatsApp Broadcast">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/marketing/campaigns/monitoring">Marketing</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>WhatsApp Broadcast</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatsCard label="Total Campaigns" value={stats.totalCampaigns} icon={Megaphone} color="bg-blue-100 text-blue-800" />
            <StatsCard label="Messages Sent" value={stats.totalMessages} icon={Send} color="bg-green-100 text-green-800" />
            <StatsCard label="Delivered" value={stats.totalDelivered} icon={CheckCircle} color="bg-emerald-100 text-emerald-800" />
            <StatsCard label="Delivery Rate" value={`${stats.deliveryRate}%`} icon={TrendingUp} color="bg-purple-100 text-purple-800" />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="campaigns">
                <BarChart3 className="h-4 w-4 mr-2" /> Campaigns
              </TabsTrigger>
              <TabsTrigger value="new">
                <Megaphone className="h-4 w-4 mr-2" /> New Broadcast
              </TabsTrigger>
            </TabsList>

            <TabsContent value="campaigns">
              <Card>
                <CardHeader>
                  <CardTitle>Broadcast History</CardTitle>
                  <CardDescription>
                    {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} — auto-refreshes every 10 seconds
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CampaignList campaigns={campaigns} isLoading={isLoading} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="new">
              <NewCampaignWizard
                institutionId={institutionId}
                templates={templates || []}
                onComplete={() => {
                  setActiveTab('campaigns');
                  refetch();
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function WhatsAppBroadcastPage() {
  return <WhatsAppBroadcastContent />;
}
