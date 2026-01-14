'use client';

/**
 * LTI Tools Table Component
 * Displays list of registered LTI tools with actions
 *
 * Created: 2026-01-12
 */

import { useState, useEffect } from 'react';
import {
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Calendar,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { LtiTool } from '@/types/lti';
import { LtiToolDialog } from './lti-tool-dialog';

export function LtiToolsTable() {
  const [tools, setTools] = useState<LtiTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<LtiTool | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/lti/tools?include_inactive=true');

      if (!response.ok) {
        throw new Error('Failed to fetch LTI tools');
      }

      const data = await response.json();
      setTools(data.data || []);
    } catch (error) {
      console.error('Failed to fetch LTI tools:', error);
      toast({
        title: 'Error',
        description: 'Failed to load LTI tools. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!toolToDelete) return;

    try {
      setDeleting(true);
      const response = await fetch(`/api/lti/tools/${toolToDelete.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete tool');
      }

      toast({
        title: 'Success',
        description: `${toolToDelete.name} has been deleted successfully.`
      });

      // Refresh table
      await fetchTools();
    } catch (error) {
      console.error('Failed to delete tool:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete tool. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setToolToDelete(null);
    }
  };

  const getToolTypeColor = (type: string) => {
    switch (type) {
      case 'matlab_grader':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'matlab_online':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'matlab_academy':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getToolTypeName = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const isLicenseExpiring = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    const daysUntilExpiry = Math.floor(
      (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isLicenseExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-gray-500">Loading LTI tools...</p>
        </div>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
        <p className="text-gray-500 mb-2">No LTI tools registered yet</p>
        <p className="text-sm text-gray-400 mb-4">
          Register your first tool to enable LTI integrations
        </p>
        <LtiToolDialog mode="create">
          <Button>Register First Tool</Button>
        </LtiToolDialog>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Client ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Features</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((tool) => (
              <TableRow key={tool.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{tool.name}</span>
                    <a
                      href={tool.launch_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-primary flex items-center gap-1"
                    >
                      {tool.launch_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={getToolTypeColor(tool.tool_type)}>
                    {getToolTypeName(tool.tool_type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {tool.client_id}
                  </code>
                </TableCell>
                <TableCell>
                  {tool.is_active ? (
                    <Badge variant="default" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      <CheckCircle className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <XCircle className="h-3 w-3" />
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {tool.license_expiry_date ? (
                    <div className="flex items-center gap-2">
                      {isLicenseExpired(tool.license_expiry_date) ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Expired
                        </Badge>
                      ) : isLicenseExpiring(tool.license_expiry_date) ? (
                        <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                          <Calendar className="h-3 w-3" />
                          Expiring Soon
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(tool.license_expiry_date).toLocaleDateString()}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No expiry</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {tool.supports_grade_passback && (
                      <Badge variant="outline" className="text-xs">Grade Sync</Badge>
                    )}
                    {tool.supports_names_roles && (
                      <Badge variant="outline" className="text-xs">Roster</Badge>
                    )}
                    {tool.supports_deep_linking && (
                      <Badge variant="outline" className="text-xs">Deep Link</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <LtiToolDialog mode="edit" tool={tool} onSuccess={fetchTools}>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </LtiToolDialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setToolToDelete(tool);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LTI Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{toolToDelete?.name}</strong>?
              This will deactivate the tool and prevent future launches.
              Existing launch records will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
