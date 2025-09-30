// app/(routes)/resource-management/resources/[id]/_components/images-tab.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, ZoomIn, Download, X } from 'lucide-react';
import type { Resource } from '@/types/resource-management';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import Image from 'next/image';

interface ImagesTabProps {
  resource: Resource;
}

export function ImagesTab({ resource }: ImagesTabProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const imageUrls = resource.image_urls || [];

  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  if (imageUrls.length === 0) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <ImageIcon className='h-12 w-12 mx-auto mb-4 text-muted-foreground' />
          <h3 className='text-lg font-semibold mb-2'>No Images</h3>
          <p className='text-muted-foreground'>
            No images have been uploaded for this resource
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Primary Image */}
      <Card>
        <CardContent className='p-6'>
          <h3 className='text-lg font-semibold mb-4'>Primary Image</h3>
          <div className='relative aspect-video rounded-lg overflow-hidden bg-gray-100 border'>
            <Image
              src={imageUrls[0]}
              alt={`${resource.name} - Primary`}
              className='h-full w-full object-contain'
              width={100}
              height={100}
            />
            <div className='absolute top-4 right-4 flex gap-2'>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => setSelectedImage(imageUrls[0])}
              >
                <ZoomIn className='h-4 w-4 mr-2' />
                View Full
              </Button>
              <Button
                size='sm'
                variant='secondary'
                onClick={() =>
                  downloadImage(imageUrls[0], `${resource.name}-primary.jpg`)
                }
              >
                <Download className='h-4 w-4 mr-2' />
                Download
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Images */}
      {imageUrls.length > 1 && (
        <Card>
          <CardContent className='p-6'>
            <h3 className='text-lg font-semibold mb-4'>
              Additional Images ({imageUrls.length - 1})
            </h3>
            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
              {imageUrls.slice(1).map((url: string, index: number) => (
                <div
                  key={index}
                  className='relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border cursor-pointer'
                  onClick={() => setSelectedImage(url)}
                >
                  <img
                    src={url}
                    alt={`${resource.name} - Image ${index + 2}`}
                    className='h-full w-full object-cover transition-transform group-hover:scale-110'
                  />
                  <div className='absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2'>
                    <Button
                      size='sm'
                      variant='secondary'
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(url);
                      }}
                    >
                      <ZoomIn className='h-4 w-4' />
                    </Button>
                    <Button
                      size='sm'
                      variant='secondary'
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(url, `${resource.name}-${index + 2}.jpg`);
                      }}
                    >
                      <Download className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Viewer Dialog */}
      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center justify-between'>
              <span>{resource.name}</span>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => setSelectedImage(null)}
              >
                <X className='h-4 w-4' />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className='relative aspect-video'>
              <img
                src={selectedImage}
                alt={resource.name}
                className='h-full w-full object-contain rounded-lg'
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
