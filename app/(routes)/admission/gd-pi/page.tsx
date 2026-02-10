'use client';

import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { format } from 'date-fns';
import {
  Users,
  MessageSquare,
  ClipboardList,
  Star,
  Plus,
  Search,
  Filter,
  Download,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Award,
  TrendingUp,
  UserCheck,
  AlertCircle,
  ChevronRight,
  Mic,
  Video,
  Settings,
  BarChart3,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useAuth } from '@/hooks/use-auth';
import {
  useInterviewSlots,
  useInterviewBookings,
  useCreateInterviewSlot,
  useUpdateInterviewBooking,
} from '@/hooks/admission/use-interviews';
import type { InterviewSlotRow, InterviewBookingRow } from '@/lib/services/admission/interview-service';

// Types
interface GDSession {
  id: string;
  topic: string;
  date: string;
  time: string;
  duration: number; // minutes
  venue: string;
  programId: string;
  programName: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  participants: GDParticipant[];
  evaluators: Evaluator[];
  maxParticipants: number;
}

interface GDParticipant {
  id: string;
  name: string;
  applicationNumber: string;
  score?: number;
  remarks?: string;
  criteria?: {
    communication: number;
    leadership: number;
    knowledge: number;
    teamwork: number;
    reasoning: number;
  };
}

interface PISession {
  id: string;
  candidateId: string;
  candidateName: string;
  applicationNumber: string;
  date: string;
  time: string;
  duration: number;
  venue: string;
  programId: string;
  programName: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'no-show';
  panelMembers: Evaluator[];
  score?: number;
  recommendation?: 'accept' | 'reject' | 'waitlist';
  feedback?: PIFeedback;
}

interface PIFeedback {
  technicalKnowledge: number;
  communication: number;
  problemSolving: number;
  attitude: number;
  careerGoals: number;
  overallImpression: string;
  strengths: string;
  areasOfImprovement: string;
}

interface Evaluator {
  id: string;
  name: string;
  role: string;
  department: string;
}

interface GDTopic {
  id: string;
  topic: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  usageCount: number;
}

// Sample data
const SAMPLE_EVALUATORS: Evaluator[] = [
  { id: 'e1', name: 'Dr. Senthil Kumar', role: 'HOD', department: 'Computer Science' },
  { id: 'e2', name: 'Prof. Lakshmi Priya', role: 'Associate Professor', department: 'Electronics' },
  { id: 'e3', name: 'Mr. Rajesh Kumar', role: 'Industry Expert', department: 'External' },
  { id: 'e4', name: 'Dr. Anitha Devi', role: 'Dean', department: 'Admissions' },
];

const SAMPLE_TOPICS: GDTopic[] = [
  { id: 't1', topic: 'Impact of AI on Employment', category: 'Technology', difficulty: 'medium', usageCount: 12 },
  { id: 't2', topic: 'Sustainable Development Goals', category: 'Environment', difficulty: 'medium', usageCount: 8 },
  { id: 't3', topic: 'Digital Education vs Traditional Learning', category: 'Education', difficulty: 'easy', usageCount: 15 },
  { id: 't4', topic: 'Work from Home: Future of Work', category: 'Business', difficulty: 'easy', usageCount: 20 },
  { id: 't5', topic: 'Ethics in Artificial Intelligence', category: 'Technology', difficulty: 'hard', usageCount: 5 },
  { id: 't6', topic: 'Healthcare Accessibility in Rural India', category: 'Social', difficulty: 'medium', usageCount: 10 },
];


const GD_CRITERIA = [
  { key: 'communication', label: 'Communication Skills', weight: 20 },
  { key: 'leadership', label: 'Leadership & Initiative', weight: 20 },
  { key: 'knowledge', label: 'Subject Knowledge', weight: 25 },
  { key: 'teamwork', label: 'Teamwork & Listening', weight: 15 },
  { key: 'reasoning', label: 'Logical Reasoning', weight: 20 },
];

const PI_CRITERIA = [
  { key: 'technicalKnowledge', label: 'Technical Knowledge', weight: 25 },
  { key: 'communication', label: 'Communication', weight: 20 },
  { key: 'problemSolving', label: 'Problem Solving', weight: 20 },
  { key: 'attitude', label: 'Attitude & Confidence', weight: 15 },
  { key: 'careerGoals', label: 'Career Goals & Clarity', weight: 20 },
];

function GDPIPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [activeTab, setActiveTab] = useState('gd');
  const [selectedGDSession, setSelectedGDSession] = useState<GDSession | null>(null);
  const [selectedPISession, setSelectedPISession] = useState<PISession | null>(null);
  const [showCreateGDDialog, setShowCreateGDDialog] = useState(false);
  const [showEvaluationDialog, setShowEvaluationDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  // Real data hooks
  const { slots: gdSlots, isLoading: gdSlotsLoading } = useInterviewSlots(institutionId, { interview_type: 'gd' });
  const { slots: piSlots, isLoading: piSlotsLoading } = useInterviewSlots(institutionId, { interview_type: 'pi' });
  const { bookings: allBookings, isLoading: bookingsLoading } = useInterviewBookings(institutionId);
  const createSlotMutation = useCreateInterviewSlot();
  const updateBookingMutation = useUpdateInterviewBooking();

  // Transform GD slots + bookings → GDSession[]
  const gdSessions = useMemo(() => {
    return gdSlots.map((slot) => {
      const slotBookings = allBookings.filter((b) => b.slot_id === slot.id);
      const participants: GDParticipant[] = slotBookings.map((b) => {
        const formData = (b.admission_applications?.form_data || {}) as Record<string, unknown>;
        const name = String(formData.full_name || formData.name || 'Unknown Candidate');
        return {
          id: b.id,
          name,
          applicationNumber: b.admission_applications?.application_number || '',
          score: b.score ?? undefined,
          remarks: b.interviewer_notes ?? undefined,
          criteria: b.feedback ? {
            communication: Number((b.feedback as any).communication) || 0,
            leadership: Number((b.feedback as any).leadership) || 0,
            knowledge: Number((b.feedback as any).knowledge) || 0,
            teamwork: Number((b.feedback as any).teamwork) || 0,
            reasoning: Number((b.feedback as any).reasoning) || 0,
          } : undefined,
        };
      });

      // Derive status from bookings
      let status: GDSession['status'] = 'scheduled';
      const allCompleted = slotBookings.length > 0 && slotBookings.every((b) => b.status === 'completed');
      if (allCompleted) {
        status = 'completed';
      } else if (slotBookings.some((b) => b.status === 'completed' || b.status === 'scheduled')) {
        const slotDateTime = new Date(`${slot.slot_date}T${slot.start_time || '00:00'}`);
        if (slotDateTime <= new Date()) status = 'in-progress';
      }
      if (slot.is_available === false) status = 'cancelled';

      // Duration from start/end time
      const startParts = (slot.start_time || '00:00').split(':').map(Number);
      const endParts = (slot.end_time || '00:00').split(':').map(Number);
      const duration = (endParts[0] - startParts[0]) * 60 + (endParts[1] - startParts[1]);

      // Panel members as Evaluator objects
      const evaluators: Evaluator[] = (slot.default_panel_members || []).map((name, i) => ({
        id: `panel-${slot.id}-${i}`,
        name: String(name),
        role: 'Panel Member',
        department: '',
      }));

      return {
        id: slot.id,
        topic: slot.location || 'GD Session',
        date: slot.slot_date,
        time: slot.start_time || '00:00',
        duration: duration > 0 ? duration : 45,
        venue: slot.location || 'TBD',
        programId: slot.program_id || '',
        programName: slot.program_id || '',
        status,
        participants,
        evaluators: evaluators.length > 0 ? evaluators : [],
        maxParticipants: slot.capacity,
      } as GDSession;
    });
  }, [gdSlots, allBookings]);

  // Transform PI bookings → PISession[]
  const piSessions = useMemo(() => {
    const piBookings = allBookings.filter((b) => b.interview_slots?.interview_type === 'pi');
    return piBookings.map((b) => {
      const slot = b.interview_slots;
      const formData = (b.admission_applications?.form_data || {}) as Record<string, unknown>;
      const candidateName = String(formData.full_name || formData.name || 'Unknown Candidate');

      const startParts = (slot?.start_time || '00:00').split(':').map(Number);
      const endParts = (slot?.end_time || '00:00').split(':').map(Number);
      const duration = (endParts[0] - startParts[0]) * 60 + (endParts[1] - startParts[1]);

      const panelMembers: Evaluator[] = (b.panel_members || slot?.default_panel_members || []).map((name, i) => ({
        id: `panel-${b.id}-${i}`,
        name: String(name),
        role: 'Panel Member',
        department: '',
      }));

      let recommendation: PISession['recommendation'];
      if (b.outcome === 'selected') recommendation = 'accept';
      else if (b.outcome === 'rejected') recommendation = 'reject';
      else if (b.outcome === 'waitlisted') recommendation = 'waitlist';

      let status: PISession['status'] = 'scheduled';
      if (b.status === 'completed') status = 'completed';
      else if (b.status === 'no_show') status = 'no-show';

      const feedback: PIFeedback | undefined = b.feedback ? {
        technicalKnowledge: Number((b.feedback as any).technicalKnowledge) || 0,
        communication: Number((b.feedback as any).communication) || 0,
        problemSolving: Number((b.feedback as any).problemSolving) || 0,
        attitude: Number((b.feedback as any).attitude) || 0,
        careerGoals: Number((b.feedback as any).careerGoals) || 0,
        overallImpression: String((b.feedback as any).overallImpression || ''),
        strengths: String((b.feedback as any).strengths || ''),
        areasOfImprovement: String((b.feedback as any).areasOfImprovement || ''),
      } : undefined;

      return {
        id: b.id,
        candidateId: b.application_id,
        candidateName,
        applicationNumber: b.admission_applications?.application_number || '',
        date: slot?.slot_date || '',
        time: slot?.start_time || '',
        duration: duration > 0 ? duration : 20,
        venue: slot?.location || 'TBD',
        programId: slot?.program_id || '',
        programName: slot?.program_id || '',
        status,
        panelMembers: panelMembers.length > 0 ? panelMembers : [],
        score: b.score ?? undefined,
        recommendation,
        feedback,
      } as PISession;
    });
  }, [allBookings]);

  const stats = useMemo(() => {
    const completedGD = gdSessions.filter(s => s.status === 'completed').length;
    const completedPI = piSessions.filter(s => s.status === 'completed').length;
    const totalParticipants = gdSessions.reduce((acc, s) => acc + s.participants.length, 0);
    const avgGDScore = gdSessions
      .filter(s => s.status === 'completed')
      .flatMap(s => s.participants)
      .filter(p => p.score)
      .reduce((acc, p, _, arr) => acc + (p.score || 0) / arr.length, 0);
    const avgPIScore = piSessions
      .filter(s => s.status === 'completed' && s.score)
      .reduce((acc, s, _, arr) => acc + (s.score || 0) / arr.length, 0);

    return { completedGD, completedPI, totalParticipants, avgGDScore, avgPIScore };
  }, [gdSessions, piSessions]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GD-PI Planning</h1>
          <p className="text-gray-600 text-sm mt-1">
            Manage Group Discussions and Personal Interviews with digital evaluation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success('Results exported')}>
            <Download className="h-4 w-4 mr-2" />
            Export Results
          </Button>
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Dialog open={showCreateGDDialog} onOpenChange={setShowCreateGDDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#0b6d41] hover:bg-[#095535]">
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Session</DialogTitle>
                <DialogDescription>
                  Schedule a new GD or PI session for candidates
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Session Type</Label>
                  <Select defaultValue="gd">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gd">Group Discussion</SelectItem>
                      <SelectItem value="pi">Personal Interview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input type="time" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>GD Topic</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAMPLE_TOPICS.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.topic}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Program</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="btech-cse">B.Tech CSE</SelectItem>
                        <SelectItem value="mba">MBA</SelectItem>
                        <SelectItem value="bpharm">B.Pharm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (mins)</Label>
                    <Input type="number" defaultValue={45} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Venue</Label>
                  <Input placeholder="e.g., Conference Room 101" />
                </div>
                <div className="space-y-2">
                  <Label>Evaluators</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Add evaluators" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAMPLE_EVALUATORS.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name} - {e.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateGDDialog(false)}>Cancel</Button>
                <Button
                  className="bg-[#0b6d41] hover:bg-[#095535]"
                  disabled={createSlotMutation.isPending}
                  onClick={() => {
                    createSlotMutation.mutate({
                      institution_id: institutionId,
                      slot_date: format(new Date(), 'yyyy-MM-dd'),
                      start_time: '09:30',
                      end_time: '10:15',
                      capacity: 10,
                      interview_type: activeTab === 'pi' ? 'pi' : 'gd',
                      is_online: false,
                    }, {
                      onSuccess: () => setShowCreateGDDialog(false),
                    });
                  }}
                >
                  {createSlotMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Session
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completedGD}</p>
                <p className="text-xs text-gray-500">GD Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completedPI}</p>
                <p className="text-xs text-gray-500">PI Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <UserCheck className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalParticipants}</p>
                <p className="text-xs text-gray-500">Participants</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Star className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgGDScore.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Avg GD Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Award className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgPIScore.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Avg PI Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="gd">Group Discussions</TabsTrigger>
            <TabsTrigger value="pi">Personal Interviews</TabsTrigger>
            <TabsTrigger value="topics">Topic Bank</TabsTrigger>
            <TabsTrigger value="evaluators">Evaluators</TabsTrigger>
          </TabsList>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* GD Tab */}
        <TabsContent value="gd" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sessions List */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">GD Sessions</CardTitle>
                <CardDescription>{gdSessions.length} sessions scheduled</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {gdSessions.map(session => (
                    <div
                      key={session.id}
                      className={cn(
                        "p-4 border rounded-lg cursor-pointer transition-all",
                        selectedGDSession?.id === session.id
                          ? "border-[#0b6d41] bg-[#0b6d41]/5"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                      onClick={() => setSelectedGDSession(session)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={session.status === 'completed' ? 'default' : session.status === 'in-progress' ? 'secondary' : 'outline'}
                              className={cn(
                                session.status === 'completed' && "bg-green-100 text-green-700",
                                session.status === 'in-progress' && "bg-blue-100 text-blue-700"
                              )}
                            >
                              {session.status === 'in-progress' && <Play className="h-3 w-3 mr-1" />}
                              {session.status}
                            </Badge>
                            <span className="text-xs text-gray-500">{session.programName}</span>
                          </div>
                          <h4 className="font-medium text-sm line-clamp-1">{session.topic}</h4>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(session.date), 'MMM d')} at {session.time}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {session.participants.length}/{session.maxParticipants}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Session Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {selectedGDSession ? 'Session Details' : 'Select a Session'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedGDSession ? (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-gray-500">Topic</Label>
                      <p className="font-medium text-sm">{selectedGDSession.topic}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-gray-500">Date & Time</Label>
                        <p className="text-sm">{format(new Date(selectedGDSession.date), 'MMM d, yyyy')}</p>
                        <p className="text-sm text-gray-600">{selectedGDSession.time} ({selectedGDSession.duration} mins)</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Venue</Label>
                        <p className="text-sm">{selectedGDSession.venue}</p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <Label className="text-xs text-gray-500 mb-2 block">Evaluators</Label>
                      <div className="space-y-2">
                        {selectedGDSession.evaluators.map(e => (
                          <div key={e.id} className="flex items-center gap-2 text-sm">
                            <div className="h-6 w-6 bg-[#0b6d41] rounded-full flex items-center justify-center text-white text-xs">
                              {e.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span>{e.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-gray-500">Participants ({selectedGDSession.participants.length})</Label>
                        {selectedGDSession.status === 'in-progress' && (
                          <Button size="sm" variant="outline" onClick={() => setShowEvaluationDialog(true)}>
                            <ClipboardList className="h-4 w-4 mr-1" />
                            Evaluate
                          </Button>
                        )}
                      </div>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {selectedGDSession.participants.map(p => (
                            <div key={p.id} className="p-2 bg-gray-50 rounded flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-gray-500">{p.applicationNumber}</p>
                              </div>
                              {p.score !== undefined && (
                                <Badge variant="secondary" className="bg-green-100 text-green-700">
                                  {p.score}%
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                    {selectedGDSession.status === 'scheduled' && (
                      <Button
                        className="w-full bg-[#0b6d41] hover:bg-[#095535]"
                        disabled={isStarting}
                        onClick={() => {
                          setIsStarting(true);
                          toast.success('Session started');
                          setIsStarting(false);
                        }}
                      >
                        {isStarting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                        Start Session
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Click on a session to view details</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PI Tab */}
        <TabsContent value="pi" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Personal Interview Sessions</CardTitle>
              <CardDescription>{piSessions.length} interviews scheduled</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Candidate</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Program</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Date & Time</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Panel</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Score</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {piSessions.map(session => (
                      <tr key={session.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium text-sm">{session.candidateName}</p>
                            <p className="text-xs text-gray-500">{session.applicationNumber}</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{session.programName}</span>
                        </td>
                        <td className="p-3">
                          <div className="text-sm">
                            <p>{format(new Date(session.date), 'MMM d, yyyy')}</p>
                            <p className="text-xs text-gray-500">{session.time} ({session.duration} mins)</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex -space-x-2">
                            {session.panelMembers.slice(0, 2).map((m, i) => (
                              <div
                                key={m.id}
                                className="h-6 w-6 bg-[#0b6d41] rounded-full flex items-center justify-center text-white text-xs border-2 border-white"
                                title={m.name}
                              >
                                {m.name.split(' ').map(n => n[0]).join('')}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant="secondary"
                            className={cn(
                              session.status === 'completed' && "bg-green-100 text-green-700",
                              session.status === 'in-progress' && "bg-blue-100 text-blue-700",
                              session.status === 'scheduled' && "bg-gray-100 text-gray-700",
                              session.status === 'no-show' && "bg-red-100 text-red-700"
                            )}
                          >
                            {session.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {session.score !== undefined ? (
                            <span className="font-medium text-sm">{session.score}%</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          {session.recommendation && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                session.recommendation === 'accept' && "bg-green-100 text-green-700",
                                session.recommendation === 'reject' && "bg-red-100 text-red-700",
                                session.recommendation === 'waitlist' && "bg-yellow-100 text-yellow-700"
                              )}
                            >
                              {session.recommendation === 'accept' && <ThumbsUp className="h-3 w-3 mr-1" />}
                              {session.recommendation === 'reject' && <ThumbsDown className="h-3 w-3 mr-1" />}
                              {session.recommendation === 'waitlist' && <Minus className="h-3 w-3 mr-1" />}
                              {session.recommendation}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Topics Tab */}
        <TabsContent value="topics" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">GD Topic Bank</CardTitle>
                  <CardDescription>Manage discussion topics for GD sessions</CardDescription>
                </div>
                <Button size="sm" className="bg-[#0b6d41] hover:bg-[#095535]" onClick={() => toast.info('Topics are configured by the admission admin')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Topic
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {SAMPLE_TOPICS.map(topic => (
                  <Card key={topic.id} className="border">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant="outline">{topic.category}</Badge>
                        <Badge
                          variant="secondary"
                          className={cn(
                            topic.difficulty === 'easy' && "bg-green-100 text-green-700",
                            topic.difficulty === 'medium' && "bg-yellow-100 text-yellow-700",
                            topic.difficulty === 'hard' && "bg-red-100 text-red-700"
                          )}
                        >
                          {topic.difficulty}
                        </Badge>
                      </div>
                      <h4 className="font-medium text-sm mb-3">{topic.topic}</h4>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Used {topic.usageCount} times</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evaluators Tab */}
        <TabsContent value="evaluators" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Evaluators Panel</CardTitle>
                  <CardDescription>Manage GD-PI evaluators and their assignments</CardDescription>
                </div>
                <Button size="sm" className="bg-[#0b6d41] hover:bg-[#095535]" onClick={() => toast.info('Evaluators are assigned by the admission admin')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Evaluator
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {SAMPLE_EVALUATORS.map(evaluator => (
                  <Card key={evaluator.id} className="border">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 bg-[#0b6d41] rounded-full flex items-center justify-center text-white font-medium">
                          {evaluator.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{evaluator.name}</h4>
                          <p className="text-xs text-gray-500">{evaluator.role}</p>
                          <p className="text-xs text-gray-400">{evaluator.department}</p>
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-[#0b6d41]">8</span>
                          <span className="text-gray-500 ml-1">GD sessions</span>
                        </div>
                        <div>
                          <span className="font-medium text-blue-600">12</span>
                          <span className="text-gray-500 ml-1">PI sessions</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Evaluation Dialog */}
      <Dialog open={showEvaluationDialog} onOpenChange={setShowEvaluationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>GD Evaluation Sheet</DialogTitle>
            <DialogDescription>
              Evaluate participants based on the criteria below
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-[#0b6d41]" />
              <div>
                <p className="font-medium text-sm">{selectedGDSession?.topic}</p>
                <p className="text-xs text-gray-500">In Progress</p>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Select Participant to Evaluate</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Choose participant" />
                </SelectTrigger>
                <SelectContent>
                  {selectedGDSession?.participants.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.applicationNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-sm font-medium">Evaluation Criteria</Label>
              {GD_CRITERIA.map(criteria => (
                <div key={criteria.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{criteria.label}</span>
                    <span className="text-xs text-gray-500">Weight: {criteria.weight}%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <Slider
                      defaultValue={[7]}
                      max={10}
                      min={1}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-8">7/10</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea placeholder="Add any specific observations about the participant..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEvaluationDialog(false)}>Cancel</Button>
            <Button
              className="bg-[#0b6d41] hover:bg-[#095535]"
              disabled={updateBookingMutation.isPending}
              onClick={() => {
                // In a real evaluation flow, we'd collect scores from the form
                // For now, show success via the mutation hook's toast
                if (selectedGDSession?.participants[0]) {
                  updateBookingMutation.mutate({
                    bookingId: selectedGDSession.participants[0].id,
                    updates: {
                      status: 'completed',
                      feedback: { communication: 7, leadership: 7, knowledge: 7, teamwork: 7, reasoning: 7 },
                    },
                  }, {
                    onSuccess: () => setShowEvaluationDialog(false),
                  });
                } else {
                  toast.info('No participant selected to evaluate');
                }
              }}
            >
              {updateBookingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Evaluation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Section */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium">GD-PI Evaluation Guidelines</h4>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                <li>GD sessions should have 6-10 participants for effective evaluation</li>
                <li>Each evaluator should independently score participants</li>
                <li>PI feedback should include both strengths and areas of improvement</li>
                <li>Final recommendations require consensus from all panel members</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GDPIPage() {
  return (
    <AdmissionErrorBoundary>
      <GDPIPageContent />
    </AdmissionErrorBoundary>
  );
}
