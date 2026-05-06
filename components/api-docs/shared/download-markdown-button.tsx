'use client';

import { useState } from 'react';
import { Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { triggerMarkdownDownload } from '@/lib/utils/download-markdown';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface DownloadMarkdownButtonProps {
  filename: string;
  content: string | (() => string);
  label?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function DownloadMarkdownButton({
  filename,
  content,
  label = 'Download as Markdown',
  variant = 'outline',
  size = 'default',
  className,
}: DownloadMarkdownButtonProps) {
  const [downloaded, setDownloaded] = useState(false);
  const { toast } = useToast();

  const handleDownload = () => {
    try {
      const resolved = typeof content === 'function' ? content() : content;
      triggerMarkdownDownload(filename, resolved);
      setDownloaded(true);
      toast({
        title: 'Markdown downloaded',
        description: `${filename.endsWith('.md') ? filename : `${filename}.md`} saved to your downloads folder.`,
      });
      setTimeout(() => setDownloaded(false), 2000);
    } catch (err) {
      console.error('Markdown download failed:', err);
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Could not generate markdown',
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      type='button'
      variant={variant}
      size={size}
      onClick={handleDownload}
      className={cn('flex items-center gap-2', className)}
    >
      {downloaded ? (
        <Check className='h-4 w-4 text-green-600' />
      ) : (
        <Download className='h-4 w-4' />
      )}
      {downloaded ? 'Downloaded!' : label}
    </Button>
  );
}
