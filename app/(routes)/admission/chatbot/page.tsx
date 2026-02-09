'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  MessageSquare,
  Users,
  TrendingUp,
  Search,
  Filter,
  Plus,
  Download,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Eye,
  Edit,
  Trash2,
  Send,
  User,
  ArrowRight,
  Zap,
  Brain,
  HelpCircle,
  Phone,
  Mail,
  Globe,
  MessageCircle,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for FAQ management
const mockFAQs = [
  {
    id: 'FAQ-001',
    question: 'What are the admission requirements for B.Tech?',
    answer: 'To apply for B.Tech, you need: 1) 10+2 with Physics, Chemistry, and Mathematics 2) Minimum 60% aggregate 3) Valid entrance exam score (JEE/State CET). Application fee is ₹500.',
    category: 'admissions',
    views: 1250,
    helpfulCount: 892,
    status: 'active',
    lastUpdated: '2026-01-10'
  },
  {
    id: 'FAQ-002',
    question: 'What is the fee structure for MBA program?',
    answer: 'MBA program fee is ₹1,50,000 per year (total 2 years = ₹3,00,000). This includes tuition, library, and lab fees. Hostel and transport are additional.',
    category: 'fees',
    views: 980,
    helpfulCount: 756,
    status: 'active',
    lastUpdated: '2026-01-08'
  },
  {
    id: 'FAQ-003',
    question: 'Is hostel accommodation available?',
    answer: 'Yes, we have separate hostels for boys and girls with AC/Non-AC options. Hostel fee ranges from ₹65,000 to ₹90,000 per year including mess.',
    category: 'facilities',
    views: 720,
    helpfulCount: 580,
    status: 'active',
    lastUpdated: '2026-01-05'
  },
  {
    id: 'FAQ-004',
    question: 'What scholarships are available?',
    answer: 'We offer: 1) Merit scholarships (up to 50% fee waiver) 2) Sports quota 3) Need-based financial aid 4) Women in STEM scholarships. Apply through the scholarship portal.',
    category: 'scholarships',
    views: 850,
    helpfulCount: 690,
    status: 'active',
    lastUpdated: '2026-01-12'
  }
];

const mockConversations = [
  {
    id: 'CONV-001',
    leadName: 'Rahul Kumar',
    leadPhone: '+91 98765 43210',
    channel: 'whatsapp',
    status: 'active',
    startTime: '2026-01-16 10:30',
    messages: 5,
    resolved: false,
    lastMessage: 'What are the placement statistics?',
    sentiment: 'positive'
  },
  {
    id: 'CONV-002',
    leadName: 'Priya Sharma',
    leadPhone: '+91 98765 43211',
    channel: 'website',
    status: 'escalated',
    startTime: '2026-01-16 09:15',
    messages: 12,
    resolved: false,
    lastMessage: 'I need to speak with someone about fee payment issues',
    sentiment: 'negative',
    assignedTo: 'Counselor Meena'
  },
  {
    id: 'CONV-003',
    leadName: 'Amit Singh',
    leadPhone: '+91 98765 43212',
    channel: 'whatsapp',
    status: 'resolved',
    startTime: '2026-01-16 08:00',
    messages: 8,
    resolved: true,
    lastMessage: 'Thank you for the information!',
    sentiment: 'positive'
  }
];

const chatbotStats = {
  totalConversations: 1250,
  resolvedWithoutHuman: 892,
  averageResponseTime: '< 5 sec',
  satisfactionRate: 87,
  escalationRate: 12,
  topQueries: ['Fees', 'Admissions', 'Placements', 'Hostel', 'Scholarships']
};

function ChatbotPageContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddFAQOpen, setIsAddFAQOpen] = useState(false);
  const [chatbotEnabled, setChatbotEnabled] = useState(true);
  const [isSavingFAQ, setIsSavingFAQ] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      admissions: 'bg-blue-100 text-blue-800',
      fees: 'bg-green-100 text-green-800',
      facilities: 'bg-purple-100 text-purple-800',
      scholarships: 'bg-yellow-100 text-yellow-800',
      placements: 'bg-orange-100 text-orange-800'
    };
    return styles[category] || 'bg-gray-100 text-gray-800';
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp': return <MessageCircle className="h-4 w-4 text-green-500" />;
      case 'website': return <Globe className="h-4 w-4 text-blue-500" />;
      case 'email': return <Mail className="h-4 w-4 text-red-500" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <Badge className="bg-green-100 text-green-800"><ThumbsUp className="h-3 w-3 mr-1" />Positive</Badge>;
      case 'negative': return <Badge className="bg-red-100 text-red-800"><ThumbsDown className="h-3 w-3 mr-1" />Negative</Badge>;
      default: return <Badge className="bg-gray-100 text-gray-800">Neutral</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-purple-500" />
            AI Chatbot & FAQ Management
          </h1>
          <p className="text-muted-foreground">Automated 24/7 lead engagement and support</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Chatbot</span>
            <Switch checked={chatbotEnabled} onCheckedChange={setChatbotEnabled} />
            <Badge className={chatbotEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
              {chatbotEnabled ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast.info('Opening chatbot settings')}>
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversations</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chatbotStats.totalConversations}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Auto-Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {chatbotStats.totalConversations > 0 ? ((chatbotStats.resolvedWithoutHuman / chatbotStats.totalConversations) * 100).toFixed(0) : '0'}%
            </div>
            <p className="text-xs text-muted-foreground">Without human intervention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chatbotStats.averageResponseTime}</div>
            <p className="text-xs text-muted-foreground">Average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Satisfaction</CardTitle>
            <ThumbsUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chatbotStats.satisfactionRate}%</div>
            <Progress value={chatbotStats.satisfactionRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{chatbotStats.escalationRate}%</div>
            <p className="text-xs text-muted-foreground">Needs human help</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="faqs">FAQ Management</TabsTrigger>
          <TabsTrigger value="conversations">Live Conversations</TabsTrigger>
          <TabsTrigger value="training">Bot Training</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Queries</CardTitle>
                <CardDescription>Most frequently asked topics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {chatbotStats.topQueries.map((query, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                        <span>{query}</span>
                      </div>
                      <Progress value={100 - (index * 15)} className="w-24" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Channel Distribution</CardTitle>
                <CardDescription>Conversations by source</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { channel: 'WhatsApp', icon: MessageCircle, count: 720, color: 'text-green-500' },
                    { channel: 'Website Widget', icon: Globe, count: 380, color: 'text-blue-500' },
                    { channel: 'Email', icon: Mail, count: 150, color: 'text-red-500' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <item.icon className={`h-4 w-4 ${item.color}`} />
                        <span>{item.channel}</span>
                      </div>
                      <span className="font-bold">{item.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Escalations */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Recent Escalations</CardTitle>
                  <CardDescription>Conversations that needed human intervention</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => toast.info('Viewing all escalations')}>
                  View All
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockConversations.filter(c => c.status === 'escalated').map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between p-3 border rounded-lg bg-orange-50">
                    <div className="flex items-center gap-3">
                      {getChannelIcon(conv.channel)}
                      <div>
                        <p className="font-medium">{conv.leadName}</p>
                        <p className="text-sm text-muted-foreground">{conv.lastMessage}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{conv.assignedTo}</Badge>
                      <Button size="sm" disabled={isTakingOver === conv.id} onClick={async () => {
                          setIsTakingOver(conv.id);
                          try {
                            await new Promise(r => setTimeout(r, 500));
                            toast.success('Conversation taken over');
                          } finally {
                            setIsTakingOver(null);
                          }
                        }}>
                          {isTakingOver === conv.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Phone className="h-4 w-4 mr-1" />}
                          Take Over
                        </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search FAQs..." className="pl-10" />
            </div>
            <Dialog open={isAddFAQOpen} onOpenChange={setIsAddFAQOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add FAQ
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New FAQ</DialogTitle>
                  <DialogDescription>Add a question and answer for the chatbot</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admissions">Admissions</SelectItem>
                        <SelectItem value="fees">Fees</SelectItem>
                        <SelectItem value="facilities">Facilities</SelectItem>
                        <SelectItem value="scholarships">Scholarships</SelectItem>
                        <SelectItem value="placements">Placements</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Input placeholder="What is the frequently asked question?" />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer</Label>
                    <Textarea placeholder="Provide a comprehensive answer..." rows={4} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddFAQOpen(false)}>Cancel</Button>
                  <Button disabled={isSavingFAQ} onClick={async () => {
                    setIsSavingFAQ(true);
                    try {
                      await new Promise(r => setTimeout(r, 500));
                      setIsAddFAQOpen(false);
                      toast.success('FAQ added successfully');
                    } finally {
                      setIsSavingFAQ(false);
                    }
                  }}>
                    {isSavingFAQ && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save FAQ
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-4">
            {mockFAQs.map((faq) => (
              <Card key={faq.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-5 w-5 text-blue-500" />
                      <CardTitle className="text-base">{faq.question}</CardTitle>
                    </div>
                    <Badge className={getCategoryBadge(faq.category)}>
                      {faq.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{faq.answer}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {faq.views} views
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {faq.helpfulCount} helpful
                      </span>
                      <span>Updated: {faq.lastUpdated}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toast.info('Opening FAQ editor')}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => toast.success('FAQ deleted')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="conversations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Conversations</CardTitle>
                  <CardDescription>Monitor and take over bot conversations</CardDescription>
                </div>
                <Button variant="outline" size="sm" disabled={isRefreshing} onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await new Promise(r => setTimeout(r, 500));
                    toast.success('Conversations refreshed');
                  } finally {
                    setIsRefreshing(false);
                  }
                }}>
                  {isRefreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockConversations.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {getChannelIcon(conv.channel)}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {conv.leadName}
                          {getSentimentBadge(conv.sentiment)}
                        </div>
                        <p className="text-sm text-muted-foreground">{conv.lastMessage}</p>
                        <p className="text-xs text-muted-foreground">{conv.startTime} • {conv.messages} messages</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        conv.status === 'active' ? 'bg-green-100 text-green-800' :
                        conv.status === 'escalated' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }>
                        {conv.status}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => toast.info('Opening conversation')}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {conv.status === 'active' && (
                        <Button size="sm" disabled={isTakingOver === conv.id} onClick={async () => {
                          setIsTakingOver(conv.id);
                          try {
                            await new Promise(r => setTimeout(r, 500));
                            toast.success('Conversation taken over');
                          } finally {
                            setIsTakingOver(null);
                          }
                        }}>
                          {isTakingOver === conv.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Take Over
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  Training Data
                </CardTitle>
                <CardDescription>Improve bot responses with more examples</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <p className="font-medium mb-2">Upload Training Data</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a CSV file with question-answer pairs to train the bot
                  </p>
                  <Button variant="outline" className="w-full" disabled={isUploading} onClick={async () => {
                    setIsUploading(true);
                    try {
                      await new Promise(r => setTimeout(r, 800));
                      toast.success('Training data uploaded');
                    } finally {
                      setIsUploading(false);
                    }
                  }}>
                    {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                    Upload CSV
                  </Button>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="font-medium mb-2">Conversation Logs</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Review past conversations to identify training opportunities
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => toast.info('Opening conversation logs')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Review Logs
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bot Personality</CardTitle>
                <CardDescription>Configure how the bot responds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Bot Name</Label>
                  <Input defaultValue="JKKN Admission Assistant" />
                </div>
                <div className="space-y-2">
                  <Label>Greeting Message</Label>
                  <Textarea
                    defaultValue="Hello! I'm your JKKN Admission Assistant. How can I help you today with your admission queries?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Escalation Trigger</Label>
                  <Select defaultValue="3">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">After 2 failed responses</SelectItem>
                      <SelectItem value="3">After 3 failed responses</SelectItem>
                      <SelectItem value="5">After 5 failed responses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={isSavingSettings} onClick={async () => {
                  setIsSavingSettings(true);
                  try {
                    await new Promise(r => setTimeout(r, 500));
                    toast.success('Settings saved');
                  } finally {
                    setIsSavingSettings(false);
                  }
                }}>
                  {isSavingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings className="h-4 w-4 mr-2" />}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ChatbotPage() {
  return (
    <AdmissionErrorBoundary>
      <ChatbotPageContent />
    </AdmissionErrorBoundary>
  );
}
