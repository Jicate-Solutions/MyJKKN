/**
 * Launch Debug Table Component
 * Detailed table showing LTI launch records with full debugging information
 *
 * Created: 2026-01-12
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Eye,
  User,
  Building2,
  Wrench,
  Clock,
  Hash,
  AlertCircle
} from 'lucide-react';

// Type matching the data structure from Supabase query
type LaunchRecord = {
  id: string;
  launched_at: string;
  launch_type: string;
  lti_message_type: string;
  user_role_sent: string;
  myjkkn_role: string;
  context_id: string;
  context_label: string;
  context_title: string;
  resource_link_id: string | null;
  resource_link_title: string | null;
  jwt_nonce: string;
  jwt_expires_at: string;
  session_duration_seconds: number | null;
  ip_address: string;
  user_id: string;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  institutions: {
    id: string;
    name: string;
    short_name: string;
  };
  learners_profiles: {
    first_name: string;
    last_name: string;
    roll_number: string;
  } | null;
};

interface LaunchDebugTableProps {
  launches: LaunchRecord[];
}

export function LaunchDebugTable({ launches }: LaunchDebugTableProps) {
  const [selectedLaunch, setSelectedLaunch] = useState<LaunchRecord | null>(
    null
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleViewDetails = (launch: LaunchRecord) => {
    setSelectedLaunch(launch);
    setDetailsOpen(true);
  };

  const getLaunchTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      assignment: 'bg-blue-100 text-blue-800',
      resource: 'bg-green-100 text-green-800',
      deep_link: 'bg-purple-100 text-purple-800',
      content_selection: 'bg-orange-100 text-orange-800'
    };

    return (
      <Badge
        variant="secondary"
        className={colors[type] || 'bg-gray-100 text-gray-800'}
      >
        {type}
      </Badge>
    );
  };

  const getRoleBadge = (role: string) => {
    if (role.includes('Instructor') || role.includes('faculty')) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          Faculty
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
        Student
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
  };

  if (launches.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          No launch records found for the selected filters
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Launched At</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {launches.map((launch) => (
              <TableRow key={launch.id}>
                {/* Launched At */}
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {format(new Date(launch.launched_at), 'MMM dd, yyyy')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(launch.launched_at), 'HH:mm:ss')}
                    </div>
                  </div>
                </TableCell>

                {/* User */}
                <TableCell>
                  {launch.learners_profiles ? (
                    <div className="space-y-1">
                      <div className="font-medium">
                        {launch.learners_profiles.first_name}{' '}
                        {launch.learners_profiles.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {launch.learners_profiles.roll_number}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <User className="h-3 w-3 inline mr-1" />
                      Non-student user
                    </div>
                  )}
                </TableCell>

                {/* Role */}
                <TableCell>{getRoleBadge(launch.user_role_sent)}</TableCell>

                {/* Tool */}
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {launch.lti_tools.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {launch.lti_tools.tool_type}
                    </div>
                  </div>
                </TableCell>

                {/* Institution */}
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">
                      {launch.institutions.short_name}
                    </span>
                  </div>
                </TableCell>

                {/* Context */}
                <TableCell>
                  <div className="max-w-xs">
                    <div className="text-sm font-medium truncate">
                      {launch.context_label}
                    </div>
                    {launch.resource_link_title && (
                      <div className="text-xs text-muted-foreground truncate">
                        {launch.resource_link_title}
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Type */}
                <TableCell>{getLaunchTypeBadge(launch.launch_type)}</TableCell>

                {/* Session Duration */}
                <TableCell>
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {formatDuration(launch.session_duration_seconds)}
                  </div>
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetails(launch)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Launch Details</DialogTitle>
            <DialogDescription>
              Complete information about this LTI launch
            </DialogDescription>
          </DialogHeader>

          {selectedLaunch && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Launch ID:</span>
                    <div className="font-mono text-xs mt-1">
                      {selectedLaunch.id}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Launched At:</span>
                    <div className="mt-1">
                      {format(
                        new Date(selectedLaunch.launched_at),
                        'MMM dd, yyyy HH:mm:ss'
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tool:</span>
                    <div className="mt-1">{selectedLaunch.lti_tools.name}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Institution:</span>
                    <div className="mt-1">
                      {selectedLaunch.institutions.name}
                    </div>
                  </div>
                </div>
              </div>

              {/* User Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3">User Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">User ID:</span>
                    <div className="font-mono text-xs mt-1">
                      {selectedLaunch.user_id}
                    </div>
                  </div>
                  {selectedLaunch.learners_profiles && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Name:</span>
                        <div className="mt-1">
                          {selectedLaunch.learners_profiles.first_name}{' '}
                          {selectedLaunch.learners_profiles.last_name}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Roll Number:</span>
                        <div className="mt-1">
                          {selectedLaunch.learners_profiles.roll_number}
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-muted-foreground">MyJKKN Role:</span>
                    <div className="mt-1">{selectedLaunch.myjkkn_role}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">LTI Role Sent:</span>
                    <div className="mt-1 text-xs">{selectedLaunch.user_role_sent}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP Address:</span>
                    <div className="mt-1 font-mono text-xs">
                      {selectedLaunch.ip_address}
                    </div>
                  </div>
                </div>
              </div>

              {/* Context Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Context Information</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Context ID:</span>
                    <div className="font-mono text-xs mt-1">
                      {selectedLaunch.context_id}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Context Label:</span>
                    <div className="mt-1">{selectedLaunch.context_label}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Context Title:</span>
                    <div className="mt-1">{selectedLaunch.context_title}</div>
                  </div>
                  {selectedLaunch.resource_link_id && (
                    <>
                      <div>
                        <span className="text-muted-foreground">
                          Resource Link ID:
                        </span>
                        <div className="font-mono text-xs mt-1">
                          {selectedLaunch.resource_link_id}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Resource Title:
                        </span>
                        <div className="mt-1">
                          {selectedLaunch.resource_link_title}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* JWT Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3">JWT Information</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nonce:</span>
                    <div className="font-mono text-xs mt-1 break-all">
                      {selectedLaunch.jwt_nonce}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expires At:</span>
                    <div className="mt-1">
                      {format(
                        new Date(selectedLaunch.jwt_expires_at),
                        'MMM dd, yyyy HH:mm:ss'
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Message Type:</span>
                    <div className="mt-1">{selectedLaunch.lti_message_type}</div>
                  </div>
                </div>
              </div>

              {/* Session Information */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Session Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Launch Type:</span>
                    <div className="mt-1">{selectedLaunch.launch_type}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Session Duration:</span>
                    <div className="mt-1">
                      {formatDuration(selectedLaunch.session_duration_seconds)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
