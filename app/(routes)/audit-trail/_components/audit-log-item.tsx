// app/(routes)/audit-trail/_components/audit-log-item.tsx
'use client';

import {
  User,
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Archive,
  RotateCcw,
  Download,
  Upload,
  LogIn,
  LogOut,
  Calendar
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AuditLog, AuditAction, AuditSeverity } from '@/types/audit-trail';
import { formatDistanceToNow } from 'date-fns';

interface AuditLogItemProps {
  log: AuditLog;
  showFullDetails?: boolean;
}

export function AuditLogItem({
  log,
  showFullDetails = false
}: AuditLogItemProps) {
  const getActionIcon = (action: AuditAction) => {
    switch (action) {
      case 'create':
        return <Plus className='h-4 w-4 text-green-600' />;
      case 'update':
        return <Edit className='h-4 w-4 text-blue-600' />;
      case 'delete':
        return <Trash2 className='h-4 w-4 text-red-600' />;
      case 'view':
        return <Eye className='h-4 w-4 text-gray-600' />;
      case 'approve':
      case 'check_in':
      case 'check_out':
      case 'complete':
        return <CheckCircle className='h-4 w-4 text-green-600' />;
      case 'reject':
      case 'cancel':
        return <XCircle className='h-4 w-4 text-red-600' />;
      case 'archive':
        return <Archive className='h-4 w-4 text-orange-600' />;
      case 'restore':
        return <RotateCcw className='h-4 w-4 text-blue-600' />;
      case 'export':
        return <Download className='h-4 w-4 text-purple-600' />;
      case 'import':
        return <Upload className='h-4 w-4 text-purple-600' />;
      case 'login':
        return <LogIn className='h-4 w-4 text-green-600' />;
      case 'logout':
        return <LogOut className='h-4 w-4 text-gray-600' />;
      default:
        return <Calendar className='h-4 w-4 text-gray-600' />;
    }
  };

  const getSeverityBadge = (severity: AuditSeverity) => {
    const configs = {
      info: {
        variant: 'outline' as const,
        label: 'Info',
        className: 'border-blue-500 text-blue-700'
      },
      warning: {
        variant: 'outline' as const,
        label: 'Warning',
        className: 'border-yellow-500 text-yellow-700'
      },
      error: { variant: 'destructive' as const, label: 'Error', className: '' },
      critical: {
        variant: 'destructive' as const,
        label: 'Critical',
        className: 'bg-red-600'
      }
    };
    const config = configs[severity] || configs.info;
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getActionBadge = (action: AuditAction) => {
    const colors = {
      create: 'bg-green-100 text-green-800',
      update: 'bg-blue-100 text-blue-800',
      delete: 'bg-red-100 text-red-800',
      view: 'bg-gray-100 text-gray-800',
      approve: 'bg-green-100 text-green-800',
      reject: 'bg-red-100 text-red-800',
      cancel: 'bg-orange-100 text-orange-800',
      check_in: 'bg-teal-100 text-teal-800',
      check_out: 'bg-teal-100 text-teal-800',
      complete: 'bg-green-100 text-green-800',
      archive: 'bg-yellow-100 text-yellow-800',
      restore: 'bg-blue-100 text-blue-800',
      export: 'bg-purple-100 text-purple-800',
      import: 'bg-purple-100 text-purple-800',
      login: 'bg-green-100 text-green-800',
      logout: 'bg-gray-100 text-gray-800'
    };
    return (
      <Badge
        variant='outline'
        className={colors[action] || 'bg-gray-100 text-gray-800'}
      >
        {action.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className='flex gap-4 p-4 hover:bg-gray-50 transition-colors border-l-4 border-l-transparent hover:border-l-blue-500'>
      {/* Icon */}
      <div className='flex-shrink-0 mt-1'>
        <div className='h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center'>
          {getActionIcon(log.action)}
        </div>
      </div>

      {/* Content */}
      <div className='flex-1 min-w-0 space-y-2'>
        {/* Header */}
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-center gap-2 flex-wrap'>
            {getActionBadge(log.action)}
            <Badge variant='outline' className='capitalize'>
              {log.module}
            </Badge>
            {getSeverityBadge(log.severity)}
          </div>
          <span className='text-xs text-muted-foreground whitespace-nowrap'>
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Description */}
        <p className='text-sm font-medium'>{log.description}</p>

        {/* User & Entity Info */}
        <div className='flex items-center gap-4 text-xs text-muted-foreground flex-wrap'>
          {log.user && (
            <div className='flex items-center gap-1'>
              <User className='h-3 w-3' />
              <span>{log.user.full_name || log.user.email}</span>
            </div>
          )}
          {log.entity_name && (
            <div className='flex items-center gap-1'>
              <span className='font-medium'>Entity:</span>
              <span>{log.entity_name}</span>
            </div>
          )}
          {log.entity_type && (
            <div className='flex items-center gap-1'>
              <span className='font-medium'>Type:</span>
              <span className='capitalize'>{log.entity_type}</span>
            </div>
          )}
        </div>

        {/* Changes (if showFullDetails and has changes) */}
        {showFullDetails && log.changes && (
          <div className='mt-2 p-3 bg-gray-50 rounded-md'>
            <p className='text-xs font-semibold mb-2'>Changes:</p>
            {log.changes.fields_changed &&
              log.changes.fields_changed.length > 0 && (
                <div className='text-xs space-y-1'>
                  <p className='font-medium'>
                    Fields changed: {log.changes.fields_changed.join(', ')}
                  </p>
                </div>
              )}
          </div>
        )}

        {/* IP Address & User Agent (if available) */}
        {showFullDetails && (log.ip_address || log.user_agent) && (
          <div className='mt-2 text-xs text-muted-foreground space-y-1'>
            {log.ip_address && (
              <p>
                <span className='font-medium'>IP:</span> {log.ip_address}
              </p>
            )}
            {log.user_agent && (
              <p className='line-clamp-1'>
                <span className='font-medium'>User Agent:</span>{' '}
                {log.user_agent}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
