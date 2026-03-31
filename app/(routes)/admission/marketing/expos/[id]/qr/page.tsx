'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useExpoEvent } from '@/hooks/admission';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  QrCode,
  Download,
  Copy,
  Check,
  ArrowLeft,
  MapPin,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';

function QrPageContent() {
  const params = useParams();
  const eventId = params.id as string;
  const { event, isLoading } = useExpoEvent(eventId);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Build the capture URL
  const captureUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/admission/marketing/expos/${eventId}/capture`
    : '';

  // Generate QR code as data URL
  useEffect(() => {
    if (!captureUrl) return;

    QRCode.toDataURL(captureUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch((err) => {
      console.error('[admission/expos] QR generation failed:', err);
    });
  }, [captureUrl]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(captureUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [captureUrl]);

  const handleDownloadQR = useCallback(() => {
    if (!qrDataUrl || !event) return;

    const link = document.createElement('a');
    link.download = `expo-qr-${event.event_name?.replace(/\s+/g, '-').toLowerCase() || eventId}.png`;
    link.href = qrDataUrl;
    link.click();
    toast.success('QR code downloaded');
  }, [qrDataUrl, event, eventId]);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 mt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!event) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">Event not found.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/admission/marketing/expos">Back to Expos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Link */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/admission/marketing/expos/${eventId}`}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Event
        </Link>
      </Button>

      {/* Event Info */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                QR Code — {event.event_name}
              </CardTitle>
              <CardDescription className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {event.city}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {event.end_date !== event.start_date && (
                    <> – {new Date(event.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                  )}
                </span>
              </CardDescription>
            </div>
            <Badge variant={event.event_status === 'in_progress' ? 'default' : 'outline'}>
              {event.event_status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* QR Code Display */}
          <div className="flex flex-col items-center gap-4">
            {qrDataUrl ? (
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${event.event_name} lead capture`}
                  width={300}
                  height={300}
                  className="rounded"
                />
              </div>
            ) : (
              <Skeleton className="h-[300px] w-[300px]" />
            )}

            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Scan this QR code at the booth to open the lead capture form.
              Team members can quickly capture visitor details.
            </p>
          </div>

          {/* Capture Link */}
          <div className="space-y-2">
            <Label>Capture Form Link</Label>
            <div className="flex gap-2">
              <Input
                value={captureUrl}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                title="Copy link"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                asChild
                title="Open in new tab"
              >
                <a href={captureUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={handleDownloadQR} disabled={!qrDataUrl} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Download QR Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to Use</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Download the QR code or copy the link above</li>
            <li>Print the QR code and display it at your exhibition booth</li>
            <li>Team members scan the QR to open the capture form on their phone</li>
            <li>They can also share the link directly via WhatsApp or SMS</li>
            <li>Each captured lead is automatically linked to this expo event</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ExpoQrPage() {
  return (
    <ContentLayout>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>QR Code</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <QrPageContent />
    </ContentLayout>
  );
}
