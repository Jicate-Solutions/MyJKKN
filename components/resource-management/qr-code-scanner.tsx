// components/resource-management/qr-code-scanner.tsx
'use client';

import { useState, useRef } from 'react';
import { Camera, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  qrCodeService,
  type QRCodeData
} from '@/lib/services/resource-management/qr-code-service';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface QRCodeScannerProps {
  trigger?: React.ReactNode;
  onScanSuccess?: (data: QRCodeData) => void;
}

export function QRCodeScanner({ trigger, onScanSuccess }: QRCodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<QRCodeData | null>(null);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setError('');

    try {
      // Create image from file
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            // Use jsQR to scan the image
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas context not available');

            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);

            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );

            // Note: You would need jsQR library for actual QR scanning from image
            // For now, we'll show a placeholder implementation

            toast({
              title: 'Info',
              description:
                'QR code scanning from image requires additional setup',
              variant: 'default'
            });
          } catch (err) {
            setError('Failed to scan QR code from image');
          } finally {
            setIsScanning(false);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Failed to process image');
      setIsScanning(false);
    }
  };

  const handleManualInput = () => {
    // For demo: simulate a scanned QR code
    const demoData: QRCodeData = {
      resourceId: 'demo-id',
      resourceName: 'Demo Resource',
      resourceCode: 'DEMO-001',
      type: 'resource',
      timestamp: new Date().toISOString()
    };

    setScannedData(demoData);
    if (onScanSuccess) {
      onScanSuccess(demoData);
    }
  };

  const handleViewResource = () => {
    if (scannedData?.resourceId) {
      router.push(`/resource-management/resources/${scannedData.resourceId}`);
      setIsOpen(false);
    }
  };

  const handleReset = () => {
    setScannedData(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          handleReset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button variant='outline'>
            <Camera className='mr-2 h-4 w-4' />
            Scan QR Code
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Scan QR Code</DialogTitle>
          <DialogDescription>
            Upload a QR code image or use camera to scan
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          {!scannedData ? (
            <>
              {/* Upload QR Code */}
              <div className='border-2 border-dashed border-gray-300 rounded-lg p-8 text-center'>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*'
                  onChange={handleFileUpload}
                  className='hidden'
                  id='qr-upload'
                />
                <label
                  htmlFor='qr-upload'
                  className='cursor-pointer flex flex-col items-center'
                >
                  <Camera className='h-12 w-12 text-gray-400 mb-3' />
                  <p className='text-sm font-medium'>Upload QR Code Image</p>
                  <p className='text-xs text-muted-foreground mt-1'>
                    Click to select an image
                  </p>
                </label>
              </div>

              {/* Camera Scan (Placeholder) */}
              <div className='text-center'>
                <p className='text-xs text-muted-foreground mb-3'>
                  Camera scanning requires additional permissions
                </p>
                <Button
                  variant='outline'
                  onClick={handleManualInput}
                  className='w-full'
                >
                  <Camera className='mr-2 h-4 w-4' />
                  Demo: Simulate Scan
                </Button>
              </div>

              {/* Error Display */}
              {error && (
                <div className='bg-red-50 border border-red-200 rounded-lg p-3'>
                  <p className='text-sm text-red-800'>{error}</p>
                </div>
              )}

              {/* Loading State */}
              {isScanning && (
                <div className='flex items-center justify-center py-4'>
                  <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900'></div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Scanned Result */}
              <div className='bg-green-50 border border-green-200 rounded-lg p-4'>
                <div className='flex items-start justify-between mb-2'>
                  <h3 className='font-semibold text-green-900'>
                    QR Code Scanned!
                  </h3>
                  <Badge
                    variant='outline'
                    className='bg-green-100 text-green-800'
                  >
                    {scannedData.type}
                  </Badge>
                </div>

                <div className='space-y-2 text-sm'>
                  <div>
                    <span className='text-gray-600'>Resource:</span>{' '}
                    <span className='font-medium text-gray-900'>
                      {scannedData.resourceName}
                    </span>
                  </div>
                  {scannedData.resourceCode && (
                    <div>
                      <span className='text-gray-600'>Code:</span>{' '}
                      <span className='font-medium text-gray-900'>
                        {scannedData.resourceCode}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className='text-gray-600'>ID:</span>{' '}
                    <span className='font-mono text-xs text-gray-900'>
                      {scannedData.resourceId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className='flex gap-2'>
                <Button onClick={handleViewResource} className='flex-1'>
                  <ExternalLink className='mr-2 h-4 w-4' />
                  View Resource
                </Button>
                <Button onClick={handleReset} variant='outline'>
                  <X className='mr-2 h-4 w-4' />
                  Scan Again
                </Button>
              </div>
            </>
          )}
        </div>

        <p className='text-xs text-center text-muted-foreground'>
          Note: Full camera scanning requires HTTPS and camera permissions
        </p>
      </DialogContent>
    </Dialog>
  );
}
