'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Phone, User, GraduationCap, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { FacilitatorService, FacilitatorDetails } from '@/lib/services/learner/facilitator-service';
import { useAuth } from '@/hooks/use-auth';

export function LearnerFacilitatorsSection() {
  const [facilitators, setFacilitators] = useState<FacilitatorDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useAuth();

  useEffect(() => {
    const fetchFacilitators = async () => {
      if (!profile?.id) {
        setError('User profile not found');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await FacilitatorService.getCurrentSemesterFacilitators(
          profile.id
        );

        if (fetchError) {
          setError(fetchError);
        } else {
          console.log('Facilitators data received in component:', data);
          setFacilitators(data);
          setError(null); // Clear any previous errors
        }
      } catch (err) {
        setError('Failed to load facilitators');
        console.error('Error loading facilitators:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFacilitators();
  }, [profile?.id]);

  const getStaffTypeColor = (staffType: string) => {
    switch (staffType.toLowerCase()) {
      case 'professor':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'assistant professor':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'associate professor':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'lecturer':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-600" />
              Current Semester Facilitators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-600" />
              Current Semester Facilitators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-gray-500">{error}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-600" />
              Current Semester Facilitators
            </CardTitle>
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              {facilitators.length} Facilitator{facilitators.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {facilitators.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No facilitators assigned for current semester</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              {facilitators.map((facilitator, index) => (
                <motion.div
                  key={facilitator.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all duration-200"
                >
                  {/* Header with Avatar and Basic Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12 border-2 border-blue-100">
                      <AvatarImage
                        src={FacilitatorService.getProfilePictureUrl(facilitator.profile_picture)}
                        alt={facilitator.full_name}
                      />
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                        {getInitials(facilitator.first_name, facilitator.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {facilitator.full_name}
                      </h3>
                      <p className="text-sm text-gray-600 truncate">
                        {facilitator.designation}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-xs mt-1 ${getStaffTypeColor(facilitator.staff_type)}`}
                      >
                        {facilitator.staff_type}
                      </Badge>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="space-y-2">
                    {/* Email */}
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600 truncate">
                        {facilitator.institution_email || facilitator.email}
                      </span>
                    </div>

                    {/* Department */}
                    {facilitator.department_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600 truncate">
                          {facilitator.department_name}
                        </span>
                      </div>
                    )}

                    {/* Course */}
                    {facilitator.course_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600 truncate">
                          {facilitator.course_name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => {
                        window.open(`mailto:${facilitator.institution_email || facilitator.email}`, '_blank');
                      }}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}