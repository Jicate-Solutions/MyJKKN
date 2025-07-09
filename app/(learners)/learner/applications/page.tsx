'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Application {
  id: string;
  title: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  submittedAt: string;
  description: string;
}

export default function LearnerApplicationsPage() {
  const mockApplications: Application[] = [
    {
      id: '1',
      title: 'Library Card Application',
      type: 'Library',
      status: 'approved',
      submittedAt: '2024-01-15',
      description: 'Application for library card to access books and resources'
    },
    {
      id: '2',
      title: 'Hostel Room Application',
      type: 'Accommodation',
      status: 'pending',
      submittedAt: '2024-01-20',
      description:
        'Application for hostel room allocation for the upcoming semester'
    },
    {
      id: '3',
      title: 'Course Change Request',
      type: 'Academic',
      status: 'rejected',
      submittedAt: '2024-01-18',
      description: 'Request to change elective course from Physics to Chemistry'
    },
    {
      id: '4',
      title: 'Scholarship Application',
      type: 'Financial',
      status: 'draft',
      submittedAt: '2024-01-22',
      description:
        'Application for merit-based scholarship for academic excellence'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className='h-4 w-4 text-green-600' />;
      case 'pending':
        return <Clock className='h-4 w-4 text-yellow-600' />;
      case 'rejected':
        return <XCircle className='h-4 w-4 text-red-600' />;
      case 'draft':
        return <FileText className='h-4 w-4 text-gray-600' />;
      default:
        return <FileText className='h-4 w-4 text-gray-600' />;
    }
  };

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='pb-20 px-4 py-6'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>
              My Applications
            </h1>
            <p className='text-gray-600'>
              Track and manage your submitted applications
            </p>
          </div>
          <Button>
            <Plus className='h-4 w-4 mr-2' />
            New Application
          </Button>
        </div>

        <div className='space-y-4'>
          {mockApplications.map((application) => (
            <Card
              key={application.id}
              className='hover:shadow-md transition-shadow'
            >
              <CardHeader className='pb-3'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-lg'>{application.title}</CardTitle>
                  <div className='flex items-center space-x-2'>
                    {getStatusIcon(application.status)}
                    <Badge className={getStatusColor(application.status)}>
                      {application.status.charAt(0).toUpperCase() +
                        application.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-gray-600'>
                      Type: {application.type}
                    </span>
                    <span className='text-gray-600'>
                      Submitted:{' '}
                      {new Date(application.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className='text-sm text-gray-700'>
                    {application.description}
                  </p>
                  <div className='flex items-center space-x-2 pt-2'>
                    <Button variant='outline' size='sm'>
                      View Details
                    </Button>
                    {application.status === 'draft' && (
                      <Button size='sm'>Continue Application</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {mockApplications.length === 0 && (
          <div className='text-center py-12'>
            <FileText className='h-12 w-12 text-gray-400 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>
              No Applications Yet
            </h3>
            <p className='text-gray-600 mb-4'>
              You haven&apos;t submitted any applications yet.
            </p>
            <Button>
              <Plus className='h-4 w-4 mr-2' />
              Create Your First Application
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
