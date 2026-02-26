'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  useLeadsWithParents,
  useParentCommLogs,
  useParentCommStats,
  useUpdateParentInfo,
} from '@/hooks/admission/use-parent-communication';
import {
  Users,
  UserPlus,
  Phone,
  MessageCircle,
  Mail,
  Search,
  Filter,
  MoreHorizontal,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  RefreshCw,
  Heart,
  Home,
  Briefcase,
  GraduationCap,
  History,
  ExternalLink,
  Edit,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Types for UI display
interface Parent {
  id: string;
  name: string;
  phone: string;
  email: string;
  relationship: 'father' | 'mother' | 'guardian';
  occupation?: string;
  isPrimary: boolean;
}

interface LeadWithParentsUI {
  id: string;
  studentName: string;
  studentPhone: string;
  stage: string;
  program: string;
  parents: Parent[];
  lastParentContact?: string;
  parentEngagementScore: number;
}

interface CommunicationLogUI {
  id: string;
  leadId: string;
  parentId: string;
  parentName: string;
  studentName: string;
  channel: 'call' | 'whatsapp' | 'email' | 'sms';
  direction: 'inbound' | 'outbound';
  status: 'completed' | 'missed' | 'pending';
  summary: string;
  duration?: number;
  timestamp: string;
  counselorName: string;
}

function getRelationshipIcon(relationship: string) {
  switch (relationship) {
    case 'father':
      return <Briefcase className="h-4 w-4" />;
    case 'mother':
      return <Heart className="h-4 w-4" />;
    case 'guardian':
      return <Home className="h-4 w-4" />;
    default:
      return <Users className="h-4 w-4" />;
  }
}

function getChannelIcon(channel: string) {
  switch (channel) {
    case 'call':
      return <Phone className="h-4 w-4" />;
    case 'whatsapp':
      return <MessageCircle className="h-4 w-4" />;
    case 'email':
      return <Mail className="h-4 w-4" />;
    default:
      return <MessageCircle className="h-4 w-4" />;
  }
}

function getEngagementColor(score: number) {
  if (score >= 70) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
  if (score >= 40) return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
  return 'text-red-600 bg-red-100 dark:bg-red-900/30';
}

function ParentCard({ parent, onCall, onMessage, onEmail }: {
  parent: Parent;
  onCall: () => void;
  onMessage: () => void;
  onEmail: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>
            {parent.name.split(' ').map(n => n[0]).join('').toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{parent.name}</span>
            {parent.isPrimary && (
              <Badge variant="outline" className="text-xs">Primary</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {getRelationshipIcon(parent.relationship)}
            <span className="capitalize">{parent.relationship}</span>
            {parent.occupation && (
              <>
                <span>•</span>
                <span>{parent.occupation}</span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{parent.phone}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={onCall}>
          <Phone className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onMessage}>
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onEmail}>
          <Mail className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SendMessageDialog({ lead, parent }: { lead: LeadWithParentsUI; parent?: Parent }) {
  const [channel, setChannel] = useState<string>('whatsapp');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Message sent successfully');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="h-4 w-4 mr-2" />
          Send Message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Message to Parent</DialogTitle>
          <DialogDescription>
            Send a message to {parent?.name || 'parent'} regarding {lead.studentName}'s admission
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Template</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="welcome">Welcome Message</SelectItem>
                <SelectItem value="fee_info">Fee Structure</SelectItem>
                <SelectItem value="admission_update">Admission Update</SelectItem>
                <SelectItem value="campus_visit">Campus Visit Invite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isSending}>Cancel</Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddParentInfoDialog({ lead }: { lead: LeadWithParentsUI }) {
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const updateParentInfo = useUpdateParentInfo();

  const handleSave = async () => {
    if (!parentName || !parentPhone) {
      toast.error('Name and phone are required');
      return;
    }
    updateParentInfo.mutate({
      leadId: lead.id,
      parentData: {
        parent_name: parentName,
        parent_phone: parentPhone,
        parent_email: parentEmail || undefined,
        parent_opted_in: true,
      },
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Parent Info
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Parent Information</DialogTitle>
          <DialogDescription>
            Add parent/guardian contact for {lead.studentName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parent Name</Label>
              <Input placeholder="Full name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input placeholder="+91 00000 00000" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email (Optional)</Label>
            <Input type="email" placeholder="email@example.com" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Occupation (Optional)</Label>
            <Input placeholder="Business, Engineer, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={updateParentInfo.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateParentInfo.isPending}>
            {updateParentInfo.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Parent Info'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParentCommunicationPageContent() {
  const { profile, isLoading: accessLoading } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadWithParentsUI | null>(null);

  // Real data hooks
  const { leads: rawLeads, total, isLoading: leadsLoading, refetch: refetchLeads } = useLeadsWithParents({
    institutionId,
    search: searchTerm || undefined,
  });
  const { logs: rawLogs, isLoading: logsLoading, refetch: refetchLogs } = useParentCommLogs(institutionId);
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useParentCommStats(institutionId);

  // Transform DB leads to UI format
  const leads: LeadWithParentsUI[] = (rawLeads || []).map((lead: any) => ({
    id: lead.id,
    studentName: lead.full_name || 'Unknown',
    studentPhone: lead.phone || '',
    stage: lead.stage || lead.funnel_stage || 'new',
    program: Array.isArray(lead.interested_programs) ? lead.interested_programs.join(', ') : (lead.interested_programs || ''),
    parents: lead.parent_name ? [{
      id: `p-${lead.id}`,
      name: lead.parent_name,
      phone: lead.parent_phone || '',
      email: lead.parent_email || '',
      relationship: 'guardian' as const,
      isPrimary: true,
    }] : [],
    lastParentContact: lead.last_contact_at || undefined,
    parentEngagementScore: lead.engagement_score || 0,
  }));

  // Transform logs to UI format
  const logs: CommunicationLogUI[] = (rawLogs || []).map((log: any) => ({
    id: log.id,
    leadId: log.lead_id || '',
    parentId: '',
    parentName: log.lead_name || 'Unknown',
    studentName: log.lead_name || 'Unknown',
    channel: log.channel as any || 'sms',
    direction: 'outbound' as const,
    status: log.status === 'delivered' || log.status === 'sent' ? 'completed' as const : 'pending' as const,
    summary: log.content || '',
    timestamp: log.sent_at || log.created_at || new Date().toISOString(),
    counselorName: '',
  }));

  const leadsWithParents = leads.filter(l => l.parents.length > 0);
  const leadsWithoutParents = leads.filter(l => l.parents.length === 0);

  const totalParents = stats.totalParentContacts;
  const avgEngagement = stats.avgEngagement;

  const filteredLeads = leads.filter(lead =>
    !searchTerm ||
    lead.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.parents.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleRefresh = () => {
    refetchLeads();
    refetchLogs();
    refetchStats();
    toast.success('Data refreshed successfully');
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Parent Communication">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Parent Communication</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Page Title */}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Parent Communication Module
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage parent contacts and track communication for better engagement
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Parents</p>
                    <p className="text-2xl font-bold">{totalParents}</p>
                    <p className="text-xs text-muted-foreground">across {stats.totalLeadsWithParentInfo} leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Engagement</p>
                    <p className="text-2xl font-bold">{avgEngagement}%</p>
                    <p className="text-xs text-muted-foreground">parent response rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Missing Parents</p>
                    <p className="text-2xl font-bold">{stats.totalLeadsWithoutParentInfo}</p>
                    <p className="text-xs text-muted-foreground">leads without parent info</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <History className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Recent Contacts</p>
                    <p className="text-2xl font-bold">{stats.recentCommunications}</p>
                    <p className="text-xs text-muted-foreground">in last 7 days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="leads" className="space-y-6">
            <TabsList>
              <TabsTrigger value="leads">Leads & Parents</TabsTrigger>
              <TabsTrigger value="logs">Communication Log</TabsTrigger>
              <TabsTrigger value="missing">Missing Parent Info</TabsTrigger>
            </TabsList>

            {/* Leads Tab */}
            <TabsContent value="leads" className="space-y-4">
              <div className="flex gap-4">
                <div className="flex gap-2 flex-1">
                  <Input
                    placeholder="Search leads or parents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button variant="outline">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {leadsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredLeads.filter(l => l.parents.length > 0).map((lead) => (
                    <Card key={lead.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-primary/10">
                                <GraduationCap className="h-6 w-6" />
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <CardTitle className="text-lg">{lead.studentName}</CardTitle>
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <Badge variant="outline">{lead.stage}</Badge>
                                <span>{lead.program}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs", getEngagementColor(lead.parentEngagementScore))}>
                              {lead.parentEngagementScore}% engagement
                            </Badge>
                            <SendMessageDialog lead={lead} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{lead.parents.length} parent contact(s)</span>
                          {lead.lastParentContact && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last contact: {formatDistanceToNow(new Date(lead.lastParentContact), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {lead.parents.map((parent) => (
                            <ParentCard
                              key={parent.id}
                              parent={parent}
                              onCall={() => toast.success(`Call initiated to ${parent.name}`)}
                              onMessage={() => toast.success(`Message opened for ${parent.name}`)}
                              onEmail={() => toast.success(`Email client opened for ${parent.name}`)}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredLeads.filter(l => l.parents.length > 0).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No leads with parent information found.
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Communication Log Tab */}
            <TabsContent value="logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Parent Communications</CardTitle>
                  <CardDescription>All communication with parents in the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parent</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead>Summary</TableHead>
                          <TableHead>Counselor</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-medium">{log.parentName}</TableCell>
                            <TableCell>{log.studentName}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getChannelIcon(log.channel)}
                                <span className="capitalize">{log.channel}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={log.direction === 'inbound' ? 'secondary' : 'outline'}>
                                {log.direction}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{log.summary}</TableCell>
                            <TableCell>{log.counselorName || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        ))}
                        {logs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No communication logs found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Missing Parent Info Tab */}
            <TabsContent value="missing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Leads Without Parent Information</CardTitle>
                  <CardDescription>
                    These leads are missing parent contact information - important for admission decisions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {leadsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : leadsWithoutParents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                      <p>All leads have parent information!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {leadsWithoutParents.map((lead) => (
                        <div
                          key={lead.id}
                          className="flex items-center justify-between p-4 rounded-lg border bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>
                                {lead.studentName.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{lead.studentName}</p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline">{lead.stage}</Badge>
                                <span>{lead.program}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <AddParentInfoDialog lead={lead} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function ParentCommunicationPage() {
  return (
    <AdmissionErrorBoundary>
      <ParentCommunicationPageContent />
    </AdmissionErrorBoundary>
  );
}
