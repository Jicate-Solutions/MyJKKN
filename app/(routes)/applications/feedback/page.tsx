'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import {
  Search,
  MoreVertical,
  Filter,
  MessageCircle,
  Star,
  StarHalf,
  Flag,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ContentLayout } from '@/components/layout/content-layout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

// Types
interface Feedback {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  application_id: string;
  application_name: string;
  category: 'bug' | 'feature' | 'improvement' | 'general';
  status: 'new' | 'in_review' | 'in_progress' | 'resolved' | 'rejected';
  priority: 'low' | 'medium' | 'high';
  rating: number;
  title: string;
  description: string;
  response?: string;
  created_at: string;
  updated_at: string;
}

// Status and Priority Colors
const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  in_review: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800'
};

const priorityColors = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800'
};

export default function FeedbackPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<string[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<string>('all');
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(
    null
  );
  const [responseText, setResponseText] = useState('');

  // Mock feedback data
  const [feedback, setFeedback] = useState<Feedback[]>([
    {
      id: '1',
      user_id: 'u1',
      user_name: 'John Doe',
      user_email: 'john.doe@jkkn.edu',
      application_id: '1',
      application_name: 'Online Attendance System',
      category: 'bug',
      status: 'new',
      priority: 'high',
      rating: 3,
      title: 'Attendance marking fails during peak hours',
      description:
        'Unable to mark attendance during morning hours when multiple users try to access the system simultaneously.',
      created_at: '2024-02-25T10:00:00Z',
      updated_at: '2024-02-25T10:00:00Z'
    }
    // Add more mock data
  ]);

  // Filter feedback based on search and filters
  const filteredFeedback = feedback.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.user_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus.length === 0 || selectedStatus.includes(item.status);
    const matchesPriority =
      selectedPriority.length === 0 || selectedPriority.includes(item.priority);
    const matchesApplication =
      selectedApplication === 'all' ||
      selectedApplication === item.application_id;

    return (
      matchesSearch && matchesStatus && matchesPriority && matchesApplication
    );
  });

  const handleUpdateStatus = async (
    feedbackId: string,
    newStatus: Feedback['status']
  ) => {
    try {
      setIsLoading(true);
      // Here you would integrate with Supabase
      // await supabase
      //   .from('feedback')
      //   .update({ status: newStatus })
      //   .eq('id', feedbackId);

      setFeedback(
        feedback.map((item) =>
          item.id === feedbackId
            ? {
                ...item,
                status: newStatus,
                updated_at: new Date().toISOString()
              }
            : item
        )
      );

      toast.success('Feedback status updated');
    } catch (error) {
      console.error('Error updating feedback status:', error);
      toast.error('Failed to update status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePriority = async (
    feedbackId: string,
    newPriority: Feedback['priority']
  ) => {
    try {
      setIsLoading(true);
      // Here you would integrate with Supabase
      // await supabase
      //   .from('feedback')
      //   .update({ priority: newPriority })
      //   .eq('id', feedbackId);

      setFeedback(
        feedback.map((item) =>
          item.id === feedbackId
            ? {
                ...item,
                priority: newPriority,
                updated_at: new Date().toISOString()
              }
            : item
        )
      );

      toast.success('Feedback priority updated');
    } catch (error) {
      console.error('Error updating feedback priority:', error);
      toast.error('Failed to update priority');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitResponse = async () => {
    if (!selectedFeedback || !responseText.trim()) return;

    try {
      setIsLoading(true);
      // Here you would integrate with Supabase
      // await supabase
      //   .from('feedback')
      //   .update({
      //     response: responseText,
      //     status: 'resolved',
      //     updated_at: new Date().toISOString()
      //   })
      //   .eq('id', selectedFeedback.id);

      setFeedback(
        feedback.map((item) =>
          item.id === selectedFeedback.id
            ? {
                ...item,
                response: responseText,
                status: 'resolved',
                updated_at: new Date().toISOString()
              }
            : item
        )
      );

      setIsResponseDialogOpen(false);
      setResponseText('');
      setSelectedFeedback(null);
      toast.success('Response submitted successfully');
    } catch (error) {
      console.error('Error submitting response:', error);
      toast.error('Failed to submit response');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= rating) {
        stars.push(
          <Star key={i} className='w-4 h-4 fill-yellow-400 text-yellow-400' />
        );
      } else if (i - 0.5 <= rating) {
        stars.push(
          <StarHalf
            key={i}
            className='w-4 h-4 fill-yellow-400 text-yellow-400'
          />
        );
      } else {
        stars.push(<Star key={i} className='w-4 h-4 text-gray-300' />);
      }
    }
    return stars;
  };

  return (
    <ContentLayout title='Application Feedback'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Feedback</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6 space-y-4'>
        {/* Header Section */}
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>
            Application Feedback
          </h1>
          <p className='text-sm text-muted-foreground'>
            Review and manage user feedback for all applications
          </p>
        </div>

        {/* Statistics Cards */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Feedback
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{feedback.length}</div>
              <p className='text-xs text-muted-foreground'>
                Across all applications
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Open Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {
                  feedback.filter((f) =>
                    ['new', 'in_review', 'in_progress'].includes(f.status)
                  ).length
                }
              </div>
              <p className='text-xs text-muted-foreground'>
                Pending resolution
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Average Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {(
                  feedback.reduce((sum, f) => sum + f.rating, 0) /
                  feedback.length
                ).toFixed(1)}
              </div>
              <div className='flex mt-1'>
                {renderStars(
                  feedback.reduce((sum, f) => sum + f.rating, 0) /
                    feedback.length
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Response Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {Math.round(
                  (feedback.filter((f) => f.response).length /
                    feedback.length) *
                    100
                )}
                %
              </div>
              <p className='text-xs text-muted-foreground'>
                Feedback with responses
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className='flex flex-col sm:flex-row gap-4'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search feedback...'
              className='pl-10'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className='w-[150px]'>
                <Filter className='mr-2 h-4 w-4' />
                Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-[200px]'>
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {['new', 'in_review', 'in_progress', 'resolved', 'rejected'].map(
                (status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={selectedStatus.includes(status)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedStatus([...selectedStatus, status]);
                      } else {
                        setSelectedStatus(
                          selectedStatus.filter((s) => s !== status)
                        );
                      }
                    }}
                  >
                    {status.replace('_', ' ').charAt(0).toUpperCase() +
                      status.slice(1)}
                  </DropdownMenuCheckboxItem>
                )
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              {['low', 'medium', 'high'].map((priority) => (
                <DropdownMenuCheckboxItem
                  key={priority}
                  checked={selectedPriority.includes(priority)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedPriority([...selectedPriority, priority]);
                    } else {
                      setSelectedPriority(
                        selectedPriority.filter((p) => p !== priority)
                      );
                    }
                  }}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={selectedApplication}
            onValueChange={setSelectedApplication}
          >
            <SelectTrigger className='w-[200px]'>
              <SelectValue placeholder='Select application' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Applications</SelectItem>
              <SelectItem value='1'>Online Attendance System</SelectItem>
              <SelectItem value='2'>Library Management</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Feedback Table */}
        <Card>
          <CardContent className='p-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Feedback</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className='w-[100px]'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFeedback.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className='flex items-center space-x-2'>
                        <Avatar className='h-8 w-8'>
                          <AvatarImage
                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${item.user_name}`}
                          />
                          <AvatarFallback>
                            {item.user_name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className='font-medium'>{item.user_name}</p>
                          <p className='text-sm text-muted-foreground'>
                            {item.user_email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className='max-w-md'>
                        <div className='flex items-center space-x-2'>
                          <Badge variant='outline'>
                            {item.category.charAt(0).toUpperCase() +
                              item.category.slice(1)}
                          </Badge>
                        </div>
                        <p className='font-medium mt-1'>{item.title}</p>
                        <p className='text-sm text-muted-foreground truncate'>
                          {item.description}
                        </p>
                        {item.response && (
                          <div className='mt-2 text-sm bg-muted/50 p-2 rounded'>
                            <p className='font-medium'>Response:</p>
                            <p className='text-muted-foreground'>
                              {item.response}
                            </p>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className='font-medium'>
                        {item.application_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className='flex'>{renderStars(item.rating)}</div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            className='h-8 flex items-center gap-2'
                          >
                            <Badge
                              variant='secondary'
                              className={statusColors[item.status]}
                            >
                              {item.status
                                .replace('_', ' ')
                                .split(' ')
                                .map(
                                  (word) =>
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                )
                                .join(' ')}
                            </Badge>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleUpdateStatus(item.id, 'new')}
                          >
                            <Clock className='mr-2 h-4 w-4' /> New
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(item.id, 'in_review')
                            }
                          >
                            <MessageCircle className='mr-2 h-4 w-4' /> In Review
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(item.id, 'in_progress')
                            }
                          >
                            <Flag className='mr-2 h-4 w-4' /> In Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(item.id, 'resolved')
                            }
                          >
                            <CheckCircle2 className='mr-2 h-4 w-4' /> Resolved
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(item.id, 'rejected')
                            }
                          >
                            <XCircle className='mr-2 h-4 w-4' /> Rejected
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' className='h-8'>
                            <Badge
                              variant='secondary'
                              className={priorityColors[item.priority]}
                            >
                              {item.priority.charAt(0).toUpperCase() +
                                item.priority.slice(1)}
                            </Badge>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuLabel>Update Priority</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleUpdatePriority(item.id, 'low')}
                          >
                            Low
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdatePriority(item.id, 'medium')
                            }
                          >
                            Medium
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdatePriority(item.id, 'high')
                            }
                          >
                            High
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <div>
                        {new Date(item.created_at).toLocaleDateString()}
                        <p className='text-sm text-muted-foreground'>
                          {new Date(item.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' size='icon'>
                            <MoreVertical className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedFeedback(item);
                              setIsResponseDialogOpen(true);
                            }}
                          >
                            Reply
                          </DropdownMenuItem>
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className='text-red-600'>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Response Dialog */}
        <Dialog
          open={isResponseDialogOpen}
          onOpenChange={setIsResponseDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Respond to Feedback</DialogTitle>
              <DialogDescription>
                Write a response to the user&apos;s feedback. This will be
                visible to the user.
              </DialogDescription>
            </DialogHeader>
            {selectedFeedback && (
              <div className='space-y-4'>
                <div className='bg-muted/50 p-4 rounded'>
                  <p className='font-medium'>{selectedFeedback.title}</p>
                  <p className='text-sm text-muted-foreground mt-1'>
                    {selectedFeedback.description}
                  </p>
                </div>
                <Textarea
                  placeholder='Write your response...'
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  className='min-h-[100px]'
                />
              </div>
            )}
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => {
                  setIsResponseDialogOpen(false);
                  setResponseText('');
                  setSelectedFeedback(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitResponse}
                disabled={!responseText.trim() || isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Response'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
