// components/resource-management/qr-code-generator.tsx
'use client';

import { useState, useEffect } from 'react';
import { Download, Printer, QrCode as QrCodeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { qrCodeService } from '@/lib/services/resource-management/qr-code-service';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

interface QRCodeGeneratorProps {
  resourceId: string;
  resourceName: string;
  resourceCode?: string;
  trigger?: React.ReactNode;
}

export function QRCodeGenerator({
  resourceId,
  resourceName,
  resourceCode,
  trigger
}: QRCodeGeneratorProps) {
  const [qrCode, setQrCode] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && !qrCode) {
      generateQRCode();
    }
  }, [isOpen]);

  const generateQRCode = async () => {
    setIsGenerating(true);
    try {
      const code = await qrCodeService.generateResourceQRCode(
        resourceId,
        resourceName,
        resourceCode
      );
      setQrCode(code);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate QR code',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    try {
      const filename = `${resourceCode || resourceId}-qrcode.png`;
      await qrCodeService.downloadQRCode(
        {
          resourceId,
          resourceName,
          resourceCode,
          type: 'resource',
          timestamp: new Date().toISOString()
        },
        filename
      );

      toast({
        title: 'Success',
        description: 'QR code downloaded successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to download QR code',
        variant: 'destructive'
      });
    }
  };

  const handlePrint = async () => {
    try {
      await qrCodeService.printQRCode(resourceId, resourceName, resourceCode);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to print QR code',
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant='outline' size='sm'>
            <QrCodeIcon className='mr-2 h-4 w-4' />
            QR Code
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Resource QR Code</DialogTitle>
          <DialogDescription>
            Scan this QR code to quickly access resource details
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col items-center space-y-4 py-4'>
          {/* Resource Info */}
          <div className='text-center'>
            <h3 className='font-semibold text-lg'>{resourceName}</h3>
            {resourceCode && (
              <p className='text-sm text-muted-foreground'>
                Code: {resourceCode}
              </p>
            )}
          </div>

          {/* QR Code Display */}
          <div className='border-4 border-gray-200 rounded-lg p-4 bg-white'>
            {isGenerating ? (
              <div className='w-[300px] h-[300px] flex items-center justify-center'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900'></div>
              </div>
            ) : qrCode ? (
              <Image
                src={qrCode}
                alt={`QR Code for ${resourceName}`}
                className='w-[300px] h-[300px]'
                width={300}
                height={300}
              />
            ) : (
              <div className='w-[300px] h-[300px] flex items-center justify-center'>
                <p className='text-muted-foreground'>No QR code generated</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className='flex gap-2 w-full'>
            <Button
              onClick={handleDownload}
              disabled={!qrCode || isGenerating}
              className='flex-1'
              variant='outline'
            >
              <Download className='mr-2 h-4 w-4' />
              Download
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!qrCode || isGenerating}
              className='flex-1'
              variant='outline'
            >
              <Printer className='mr-2 h-4 w-4' />
              Print
            </Button>
          </div>

          <p className='text-xs text-center text-muted-foreground'>
            QR code contains resource ID and basic information
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
