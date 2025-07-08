'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bug, X, TestTube, Camera } from 'lucide-react';
import html2canvas from 'html2canvas';
import Image from 'next/image';

// Store captured console logs
const capturedLogs: any[] = [];

// Helper to format timestamp
const getTimestamp = () => new Date().toISOString();

// Override console methods to capture logs
if (typeof window !== 'undefined') {
  const originalConsole = { ...console };
  const logTypes: ('log' | 'warn' | 'error' | 'info' | 'debug')[] = [
    'log',
    'warn',
    'error',
    'info',
    'debug'
  ];

  logTypes.forEach((type) => {
    console[type] = (...args: any[]) => {
      capturedLogs.push({
        type,
        timestamp: getTimestamp(),
        message: args
      });
      originalConsole[type](...args);
    };
  });
}

// Safe JSON serialization to handle circular references
function safeStringify(obj: any, maxDepth = 3): any {
  const seen = new WeakSet();

  function replacer(key: string, value: any, depth = 0): any {
    if (depth > maxDepth) {
      return '[Max Depth Exceeded]';
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular Reference]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item, index) =>
        replacer(String(index), item, depth + 1)
      );
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }

    if (typeof value === 'object') {
      const result: any = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === 'target' || k === 'currentTarget' || k === 'srcElement') {
          // Skip DOM elements that often cause circular references
          result[k] = '[DOM Element]';
        } else {
          result[k] = replacer(k, v, depth + 1);
        }
      }
      return result;
    }

    return value;
  }

  return JSON.parse(JSON.stringify(obj, (key, value) => replacer(key, value)));
}

// Helper function to safely serialize console arguments
function serializeConsoleArgs(args: any[]): any[] {
  return args.map((arg) => {
    try {
      return safeStringify(arg);
    } catch (error) {
      return `[Serialization Error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }]`;
    }
  });
}

// Helper function to detect mobile devices
function isMobileDevice(): boolean {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    (window.innerWidth <= 768 && 'ontouchstart' in window)
  );
}

// Enhanced screenshot capture function with mobile support
async function capturePageScreenshot(): Promise<string> {
  const isMobile = isMobileDevice();

  // Mobile-specific handling
  if (isMobile) {
    console.log('Mobile device detected, using mobile-optimized capture...');

    // Option 1: Check clipboard for mobile screenshots (iOS/Android share functionality)
    if ('clipboard' in navigator && 'read' in navigator.clipboard) {
      try {
        console.log('Checking clipboard for mobile screenshot...');

        const clipboardItems = await navigator.clipboard.read();

        for (const clipboardItem of clipboardItems) {
          if (
            clipboardItem.types.includes('image/png') ||
            clipboardItem.types.includes('image/jpeg')
          ) {
            const mimeType = clipboardItem.types.includes('image/png')
              ? 'image/png'
              : 'image/jpeg';
            const blob = await clipboardItem.getType(mimeType);
            const dataURL = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            console.log(
              'Found mobile screenshot in clipboard, size:',
              dataURL.length
            );
            return dataURL;
          }
        }

        console.log('No screenshot in mobile clipboard, using html2canvas...');
      } catch (error) {
        console.log('Mobile clipboard check failed, using html2canvas:', error);
      }
    }

    // Option 2: Mobile-optimized html2canvas
    return await captureMobileOptimizedScreenshot();
  }

  // Desktop handling (existing logic)
  // Option 1: Try clipboard first (Windows native screenshots - highest quality)
  if ('clipboard' in navigator && 'read' in navigator.clipboard) {
    try {
      console.log('Checking clipboard for existing screenshot...');

      const clipboardItems = await navigator.clipboard.read();

      for (const clipboardItem of clipboardItems) {
        if (clipboardItem.types.includes('image/png')) {
          const blob = await clipboardItem.getType('image/png');
          const dataURL = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          console.log('Found screenshot in clipboard, size:', dataURL.length);
          return dataURL;
        }
      }

      console.log('No screenshot in clipboard, trying other methods...');
    } catch (error) {
      console.log('Clipboard check failed, trying other methods:', error);
    }
  }

  // Option 2: Try Screen Capture API with current tab preference (Desktop only)
  if ('getDisplayMedia' in navigator.mediaDevices) {
    try {
      console.log('Attempting to use Screen Capture API for current tab...');

      // Request screen capture with preference for current tab
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 1 }
        },
        audio: false,
        preferCurrentTab: true // This hints to prefer current tab
      } as any); // Type assertion since preferCurrentTab might not be in types yet

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      video.style.position = 'absolute';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      document.body.appendChild(video);

      return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play();

          // Wait for video to start playing
          setTimeout(() => {
            try {
              // Create canvas and capture frame
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;

              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error('Could not get canvas context');

              ctx.drawImage(video, 0, 0);

              // Stop the stream
              stream.getTracks().forEach((track) => track.stop());

              // Clean up
              document.body.removeChild(video);

              // Convert to data URL with high quality
              const dataURL = canvas.toDataURL('image/png', 1.0);
              console.log(
                'Screen Capture API screenshot captured, size:',
                dataURL.length
              );
              resolve(dataURL);
            } catch (error) {
              console.error('Error capturing frame:', error);
              // Clean up
              stream.getTracks().forEach((track) => track.stop());
              document.body.removeChild(video);
              reject(error);
            }
          }, 500);
        };

        video.onerror = (error) => {
          console.error('Video error:', error);
          stream.getTracks().forEach((track) => track.stop());
          document.body.removeChild(video);
          reject(error);
        };
      });
    } catch (error) {
      console.log(
        'Screen Capture API failed, falling back to html2canvas:',
        error
      );
    }
  }

  // Option 3: Fallback to improved html2canvas
  return await captureMobileOptimizedScreenshot();
}

// Mobile-optimized html2canvas function
async function captureMobileOptimizedScreenshot(): Promise<string> {
  console.log('Using mobile-optimized html2canvas...');

  const isMobile = isMobileDevice();

  // Hide all potential overlay elements before taking screenshot
  const elementsToHide = [
    '[data-radix-portal]',
    '[data-sonner-toaster]',
    '.toast',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '.modal',
    '.overlay',
    '.popup'
  ];

  const hiddenElements: { element: HTMLElement; originalDisplay: string }[] =
    [];

  // Hide overlay elements
  elementsToHide.forEach((selector) => {
    const elements = document.querySelectorAll(
      selector
    ) as NodeListOf<HTMLElement>;
    elements.forEach((element) => {
      if (element.style.display !== 'none') {
        hiddenElements.push({
          element,
          originalDisplay: element.style.display || ''
        });
        element.style.display = 'none';
      }
    });
  });

  try {
    // Wait for elements to be hidden
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Mobile-optimized settings
    const mobileSettings = {
      height: window.innerHeight,
      width: window.innerWidth,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      allowTaint: false,
      scale: isMobile ? 1 : window.devicePixelRatio || 2, // Lower scale for mobile to avoid memory issues
      logging: false,
      removeContainer: true,
      backgroundColor: '#ffffff',
      foreignObjectRendering: !isMobile, // Disable on mobile for better compatibility
      imageTimeout: isMobile ? 15000 : 10000, // Longer timeout for mobile
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      ignoreElements: (element: Element) => {
        return (
          element.hasAttribute('data-radix-portal') ||
          element.hasAttribute('data-sonner-toaster') ||
          element.getAttribute('role') === 'dialog' ||
          element.getAttribute('role') === 'alertdialog' ||
          element.classList.contains('toast') ||
          element.classList.contains('modal') ||
          element.classList.contains('overlay') ||
          element.classList.contains('popup')
        );
      }
    };

    // Capture with mobile-optimized settings
    const canvas = await html2canvas(document.body, mobileSettings);

    // Convert with appropriate quality (lower for mobile to reduce size)
    const quality = isMobile ? 0.8 : 1.0;
    const dataURL = canvas.toDataURL('image/jpeg', quality); // Use JPEG for mobile to reduce size
    console.log('Mobile-optimized screenshot captured, size:', dataURL.length);
    return dataURL;
  } finally {
    // Restore hidden elements
    hiddenElements.forEach(({ element, originalDisplay }) => {
      element.style.display = originalDisplay;
    });
  }
}

export function BugReporterWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [capturedScreenshot, setCapturedScreenshot] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  const [testResults, setTestResults] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    // This ensures the component only renders on the client
    setIsClient(true);
  }, []);

  const runTest = async () => {
    try {
      console.log('Running bug report test...');
      const response = await fetch('/api/bug-reports/test');
      const result = await response.json();

      console.log('Test result:', result);
      setTestResults(JSON.stringify(result, null, 2));

      toast({
        title: result.success ? 'Test Passed' : 'Test Failed',
        description: result.success
          ? 'Bug reporting system is working!'
          : 'There are issues with the system',
        variant: result.success ? 'default' : 'destructive'
      });
    } catch (error) {
      console.error('Test failed:', error);
      setTestResults(
        `Test failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      toast({
        title: 'Test Failed',
        description: 'Could not run the test',
        variant: 'destructive'
      });
    }
  };

  const handleOpenBugReport = async () => {
    setIsCapturingScreenshot(true);

    try {
      console.log('Starting automatic screenshot capture...');
      const screenshot = await capturePageScreenshot();
      setCapturedScreenshot(screenshot);
      console.log('Screenshot captured successfully, size:', screenshot.length);

      // Open the dialog immediately
      setIsOpen(true);

      // Show success message if screenshot was captured
      if (screenshot) {
        toast({
          title: 'Bug Report Ready',
          description: isMobileDevice()
            ? 'Screenshot captured automatically. You can replace it with a manual one using device buttons if needed.'
            : 'Screenshot captured automatically. You can replace it with a manual one if needed.',
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);

      // Still open the dialog even if screenshot fails
      setIsOpen(true);

      toast({
        title: 'Bug Report Ready',
        description: isMobileDevice()
          ? 'You can add a high-quality screenshot manually using your device screenshot buttons.'
          : 'You can add a high-quality screenshot manually using Windows + Shift + S.',
        variant: 'default'
      });
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const handleManualScreenshot = async () => {
    setIsCapturingScreenshot(true);

    const isMobile = isMobileDevice();

    try {
      // Check if clipboard API is supported
      if ('clipboard' in navigator && 'read' in navigator.clipboard) {
        // Mobile-specific instructions
        if (isMobile) {
          const shouldTryClipboard = confirm(
            'Mobile Screenshot Options:\n\n' +
              'iOS:\n' +
              '1. Press Home + Power buttons (or Volume Up + Power on newer devices)\n' +
              '2. Take screenshot of this page\n' +
              '3. Copy the screenshot\n' +
              '4. Click OK to load from clipboard\n\n' +
              'Android:\n' +
              '1. Press Power + Volume Down buttons\n' +
              '2. Take screenshot of this page\n' +
              '3. Share → Copy to clipboard\n' +
              '4. Click OK to load from clipboard\n\n' +
              'Click OK to check clipboard, or Cancel to skip.'
          );

          if (shouldTryClipboard) {
            try {
              const clipboardItems = await navigator.clipboard.read();

              for (const clipboardItem of clipboardItems) {
                if (
                  clipboardItem.types.includes('image/png') ||
                  clipboardItem.types.includes('image/jpeg')
                ) {
                  const mimeType = clipboardItem.types.includes('image/png')
                    ? 'image/png'
                    : 'image/jpeg';
                  const blob = await clipboardItem.getType(mimeType);
                  const dataURL = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });

                  setCapturedScreenshot(dataURL);
                  toast({
                    title: 'Mobile Screenshot Added!',
                    description: 'High-quality screenshot loaded successfully.',
                    variant: 'default'
                  });
                  return;
                }
              }

              // No image found
              toast({
                title: 'No Screenshot Found',
                description:
                  'Please take a screenshot first using your device buttons, then try again.',
                variant: 'destructive'
              });
            } catch (clipboardError) {
              console.error('Mobile clipboard access failed:', clipboardError);
              toast({
                title: 'Clipboard Access Limited',
                description:
                  'Mobile browsers have limited clipboard access. The automatic capture will be used instead.',
                variant: 'default'
              });
            }
          }
        } else {
          // Desktop instructions (existing)
          const shouldTryClipboard = confirm(
            'For best screenshot quality:\n\n' +
              '1. Press Windows + Shift + S (Snipping Tool)\n' +
              '2. Select the area you want to capture\n' +
              '3. Click OK to load from clipboard\n\n' +
              'Alternative: Press Print Screen, then click OK\n\n' +
              'Click OK to check clipboard, or Cancel to skip.'
          );

          if (shouldTryClipboard) {
            try {
              const clipboardItems = await navigator.clipboard.read();

              for (const clipboardItem of clipboardItems) {
                if (clipboardItem.types.includes('image/png')) {
                  const blob = await clipboardItem.getType('image/png');
                  const dataURL = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });

                  setCapturedScreenshot(dataURL);
                  toast({
                    title: 'High-Quality Screenshot Added!',
                    description:
                      'Screenshot loaded from clipboard successfully.',
                    variant: 'default'
                  });
                  return;
                }
              }

              // No image found
              toast({
                title: 'No Screenshot Found',
                description:
                  'Please take a screenshot first (Windows + Shift + S), then try again.',
                variant: 'destructive'
              });
            } catch (clipboardError) {
              console.error('Clipboard access failed:', clipboardError);
              toast({
                title: 'Clipboard Access Denied',
                description:
                  'Please allow clipboard permissions in your browser settings.',
                variant: 'destructive'
              });
            }
          }
        }
      } else {
        // Clipboard not supported
        toast({
          title: 'Manual Screenshot Not Available',
          description: isMobile
            ? 'Your mobile browser does not support clipboard access for manual screenshots.'
            : 'Your browser does not support clipboard access for manual screenshots.',
          variant: 'destructive'
        });
      }
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const handleSubmit = async () => {
    if (!description || description.trim().length < 10) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a description of at least 10 characters.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('Starting bug report submission...');

      // Safely serialize console logs
      const safeLogs = serializeConsoleArgs(capturedLogs);
      console.log('Console logs serialized, count:', safeLogs.length);

      // Prepare payload with the pre-captured screenshot
      const payload = {
        page_url: window.location.href,
        description: description.trim(),
        screenshot_data_url: capturedScreenshot, // Use the pre-captured screenshot
        console_logs: safeLogs,
        metadata: {
          userAgent: navigator.userAgent,
          screenResolution: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString()
        }
      };

      console.log('Payload prepared:', {
        page_url: payload.page_url,
        description_length: payload.description.length,
        screenshot_size: payload.screenshot_data_url.length,
        console_logs_count: payload.console_logs.length,
        metadata: payload.metadata
      });

      // Submit the bug report
      console.log('Submitting bug report...');
      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);

        let errorMessage = 'Failed to create bug report.';
        if (errorData.error) {
          if (Array.isArray(errorData.error)) {
            // Zod validation errors
            errorMessage = errorData.error
              .map((err: any) => err.message)
              .join(', ');
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Bug report created successfully:', result);

      toast({
        title: 'Bug Report Submitted',
        description: 'Thank you for reporting this issue!'
      });

      // Reset form
      setDescription('');
      setCapturedScreenshot('');
      setIsOpen(false);

      // Clear captured logs
      capturedLogs.length = 0;
    } catch (error) {
      console.error('Bug report submission failed:', error);
      toast({
        title: 'Submission Failed',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render on server
  if (!isClient) return null;

  return (
    <>
      {/* Floating Bug Report Button */}
      <Button
        onClick={handleOpenBugReport}
        disabled={isCapturingScreenshot}
        className={`fixed ${
          isMobileDevice() ? 'bottom-4 right-4' : 'bottom-4 right-4'
        } z-50 rounded-full w-12 h-12 p-0 shadow-lg hover:shadow-xl transition-shadow`}
        variant='destructive'
        title={
          isCapturingScreenshot
            ? 'Capturing screenshot...'
            : isMobileDevice()
            ? 'Report a Bug (Mobile)'
            : 'Report a Bug'
        }
      >
        {isCapturingScreenshot ? (
          <Camera className='w-5 h-5 animate-pulse' />
        ) : (
          <Bug className='w-5 h-5' />
        )}
      </Button>

      {/* Bug Report Modal */}
      {isOpen && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
          <Card className='w-full max-w-md'>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle className='flex items-center gap-2'>
                <Bug className='w-5 h-5' />
                Report a Bug
              </CardTitle>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setIsOpen(false);
                  setCapturedScreenshot('');
                  setDescription('');
                }}
              >
                <X className='w-4 h-4' />
              </Button>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <label className='text-sm font-medium'>
                  Describe the issue *
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='What went wrong? Please provide as much detail as possible...'
                  className='mt-1'
                  rows={4}
                />
                <p className='text-xs text-muted-foreground mt-1'>
                  Minimum 10 characters required
                </p>
              </div>

              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Badge variant='outline'>Auto-captured</Badge>
                <span>Console logs</span>
                {capturedScreenshot && (
                  <>
                    <span>•</span>
                    <span className='text-green-600'>Screenshot ✓</span>
                  </>
                )}
              </div>

              {capturedScreenshot && (
                <div>
                  <label className='text-sm font-medium text-green-600'>
                    ✓ Screenshot captured
                  </label>
                  <div className='mt-1 border rounded overflow-hidden'>
                    <Image
                      src={capturedScreenshot}
                      alt='Captured screenshot'
                      className='w-full h-20 object-cover object-top'
                    />
                  </div>
                  <div className='flex gap-2 mt-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={handleManualScreenshot}
                      disabled={isCapturingScreenshot}
                      className='text-xs'
                    >
                      <Camera className='w-3 h-3 mr-1' />
                      Replace Screenshot
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setCapturedScreenshot('')}
                      className='text-xs'
                    >
                      <X className='w-3 h-3 mr-1' />
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              {!capturedScreenshot && (
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Screenshot
                  </label>
                  <div className='mt-1 p-4 border-2 border-dashed border-muted-foreground/25 rounded-lg text-center'>
                    <Camera className='w-8 h-8 mx-auto text-muted-foreground/50 mb-2' />
                    <p className='text-sm text-muted-foreground mb-3'>
                      No screenshot captured
                    </p>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={handleManualScreenshot}
                      disabled={isCapturingScreenshot}
                      className='text-xs'
                    >
                      <Camera className='w-3 h-3 mr-1' />
                      {isCapturingScreenshot
                        ? 'Processing...'
                        : 'Add Screenshot'}
                    </Button>
                    <p className='text-xs text-muted-foreground mt-2'>
                      {isMobileDevice()
                        ? 'Use device screenshot buttons for highest quality'
                        : 'Use Windows + Shift + S for highest quality'}
                    </p>
                  </div>
                </div>
              )}

              <div className='flex gap-2'>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || description.trim().length < 10}
                  className='flex-1'
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Report'}
                </Button>
                <Button variant='outline' onClick={runTest} size='sm'>
                  <TestTube className='w-4 h-4' />
                </Button>
              </div>

              {testResults && (
                <div className='mt-4'>
                  <h4 className='text-sm font-medium mb-2'>Test Results:</h4>
                  <pre className='text-xs bg-muted p-2 rounded overflow-auto max-h-32'>
                    {testResults}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
