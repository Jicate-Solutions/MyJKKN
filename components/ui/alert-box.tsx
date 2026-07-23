import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertBoxProps {
  type: 'error' | 'success' | 'info' | 'warning';
  message: string;
  className?: string;
}

export function AlertBox({ type, message, className }: AlertBoxProps) {
  const getConfig = (type: string) => {
    switch (type) {
      case 'error':
        return {
          icon: AlertCircle,
          bgClass: 'bg-red-50 border-red-300',
          textClass: 'text-red-900',
        };
      case 'success':
        return {
          icon: CheckCircle2,
          bgClass: 'bg-green-50 border-green-300',
          textClass: 'text-green-900',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          bgClass: 'bg-amber-50 border-amber-300',
          textClass: 'text-amber-900',
        };
      case 'info':
      default:
        return {
          icon: Info,
          bgClass: 'bg-blue-50 border-blue-300',
          textClass: 'text-blue-900',
        };
    }
  };

  const config = getConfig(type);
  const Icon = config.icon;

  return (
    <Alert className={cn(config.bgClass, className)}>
      <Icon className="h-4 w-4" />
      <AlertDescription className={config.textClass}>
        {message}
      </AlertDescription>
    </Alert>
  );
}
