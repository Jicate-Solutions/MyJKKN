'use client';

import { Calendar, Clock, MapPin, Users, BookOpen, PartyPopper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Event {
  id: string;
  title: string;
  date: string;
  type: string;
  location?: string;
  description?: string;
}

interface UpcomingEventsProps {
  events: Event[];
  learnerName?: string;
}

export function UpcomingEvents({ events, learnerName }: UpcomingEventsProps) {
  const getEventIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'exam':
        return <BookOpen className="h-4 w-4 text-blue-600" />;
      case 'holiday':
        return <PartyPopper className="h-4 w-4 text-green-600" />;
      case 'meeting':
        return <Users className="h-4 w-4 text-purple-600" />;
      case 'event':
        return <Calendar className="h-4 w-4 text-orange-600" />;
      default:
        return <Calendar className="h-4 w-4 text-gray-600" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'exam':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'holiday':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'meeting':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'event':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if date is today
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

    // Check if date is tomorrow
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    // Format relative days
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7 && diffDays > 0) {
      return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }

    // Default format
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Upcoming Events
          {learnerName && (
            <span className="text-sm font-normal text-gray-500">
              for {learnerName}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="py-8 text-center">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No upcoming events</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className={`rounded-lg border p-3 transition-all hover:shadow-md ${getEventColor(event.type)}`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="rounded-lg bg-white p-2">
                    {getEventIcon(event.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{event.title}</h4>
                        {event.description && (
                          <p className="mt-1 text-xs opacity-75">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2 bg-white text-xs">
                        {event.type}
                      </Badge>
                    </div>

                    {/* Date & Time */}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(event.date)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(event.date)}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
