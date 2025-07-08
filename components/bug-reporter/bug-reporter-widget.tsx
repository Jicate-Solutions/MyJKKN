'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bug, X, TestTube, Camera, Zap } from 'lucide-react';
import html2canvas from 'html2canvas';

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

// High-quality screenshot capture using html2canvas with best practices
async function captureScreenshotWithHtml2Canvas(): Promise<string> {
  console.log('Starting html2canvas high-quality screenshot capture...');

  const isMobile = isMobileDevice();

  // Store current scroll position to restore later
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  try {
    // Scroll to top for consistent screenshots
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    // Wait for scroll to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // html2canvas options optimized for better screenshot quality
    const options = {
      // Quality and scaling options
      scale: Math.max(window.devicePixelRatio || 1, 2), // Force minimum 2x scale for crisp images
      backgroundColor: '#ffffff', // White background to avoid transparency issues

      // Performance options
      useCORS: true, // Enable CORS for cross-origin images
      allowTaint: false, // Prevent canvas tainting for security
      removeContainer: true, // Clean up temporary DOM elements
      logging: false, // Disable logging for production

      // Image handling
      imageTimeout: isMobile ? 15000 : 30000, // Timeout for loading images

      // Enhanced window dimensions - capture full scrollable content
      windowWidth: Math.max(
        window.innerWidth,
        document.documentElement.scrollWidth
      ),
      windowHeight: Math.max(
        window.innerHeight,
        document.documentElement.scrollHeight
      ),

      // Capture full page content
      width: Math.max(window.innerWidth, document.documentElement.scrollWidth),
      height: Math.max(
        window.innerHeight,
        document.documentElement.scrollHeight
      ),

      // Scroll position - start from top
      scrollX: 0,
      scrollY: 0,

      // Additional quality options
      foreignObjectRendering: true, // Better text and complex element rendering

      // Element filtering - ignore overlay elements
      ignoreElements: (element: Element) => {
        // Skip the bug reporter widget itself
        if (element.classList.contains('bug-reporter-widget')) return true;

        // Skip overlay elements by class
        const className = element.className || '';
        if (typeof className === 'string') {
          const overlayClasses = [
            'radix-portal',
            'toast',
            'modal',
            'overlay',
            'popup',
            'dropdown',
            'tooltip',
            'popover',
            'dialog',
            'notification'
          ];
          if (overlayClasses.some((cls) => className.includes(cls))) {
            return true;
          }
        }

        // Skip elements by role
        const role = element.getAttribute('role');
        if (
          role &&
          ['dialog', 'alertdialog', 'tooltip', 'menu'].includes(role)
        ) {
          return true;
        }

        // Skip elements by data attributes
        if (
          element.hasAttribute('data-radix-portal') ||
          element.hasAttribute('data-sonner-toaster') ||
          element.hasAttribute('data-html2canvas-ignore')
        ) {
          return true;
        }

        // Skip hidden elements
        const computedStyle = window.getComputedStyle(element);
        if (
          computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          computedStyle.opacity === '0'
        ) {
          return true;
        }

        return false;
      },

      // Modify cloned document before rendering
      onclone: (clonedDoc: Document) => {
        // Remove any remaining overlay elements in the cloned document
        const overlaySelectors = [
          '[data-radix-portal]',
          '[data-sonner-toaster]',
          '.toast',
          '[role="dialog"]',
          '[role="alertdialog"]',
          '.modal',
          '.overlay',
          '.popup',
          '.bug-reporter-widget'
        ];

        overlaySelectors.forEach((selector) => {
          try {
            const elements = clonedDoc.querySelectorAll(selector);
            elements.forEach((el) => el.remove());
          } catch (e) {
            console.warn('Failed to remove overlay elements:', e);
          }
        });

        // Ensure high quality rendering with enhanced styles
        try {
          const style = clonedDoc.createElement('style');
          style.textContent = `
            * {
              image-rendering: -webkit-optimize-contrast !important;
              image-rendering: crisp-edges !important;
              text-rendering: optimizeLegibility !important;
              -webkit-font-smoothing: antialiased !important;
              -moz-osx-font-smoothing: grayscale !important;
              transform: translateZ(0) !important;
              backface-visibility: hidden !important;
            }
            body {
              overflow: visible !important;
              position: static !important;
            }
            * {
              box-shadow: none !important;
              filter: none !important;
              backdrop-filter: none !important;
            }
            img {
              image-rendering: high-quality !important;
              image-rendering: -webkit-optimize-contrast !important;
            }
          `;

          // Safely append style to head with fallback
          if (clonedDoc.head) {
            clonedDoc.head.appendChild(style);
          } else if (clonedDoc.documentElement) {
            // Fallback: create head if it doesn't exist
            const head = clonedDoc.createElement('head');
            head.appendChild(style);
            clonedDoc.documentElement.insertBefore(
              head,
              clonedDoc.documentElement.firstChild
            );
          }
        } catch (e) {
          console.warn('Failed to add quality styles:', e);
        }

        // Add timestamp to help with debugging (with safe body access)
        try {
          if (clonedDoc.body) {
            const timestamp = clonedDoc.createElement('div');
            timestamp.style.display = 'none';
            timestamp.setAttribute(
              'data-screenshot-timestamp',
              new Date().toISOString()
            );
            clonedDoc.body.appendChild(timestamp);
          }
        } catch (e) {
          console.warn('Failed to add timestamp:', e);
        }
      }
    };

    console.log('Capturing with html2canvas options:', {
      scale: options.scale,
      backgroundColor: options.backgroundColor,
      windowSize: `${options.windowWidth}x${options.windowHeight}`,
      captureSize: `${options.width}x${options.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      scrollSize: `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`,
      mobile: isMobile
    });

    // Wait a moment for any dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Capture with html2canvas - use document.documentElement for full page
    const targetElement = document.documentElement;
    const canvas = await html2canvas(targetElement, options);

    // Convert to high-quality data URL
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    console.log('html2canvas screenshot captured successfully:', {
      size: dataUrl.length,
      canvasSize: `${canvas.width}x${canvas.height}`,
      quality: '100%'
    });

    // Restore original scroll position
    window.scrollTo({
      top: originalScrollY,
      left: originalScrollX,
      behavior: 'instant'
    });

    return dataUrl;
  } catch (error) {
    console.error('html2canvas capture failed:', error);

    // Restore scroll position even on error
    window.scrollTo({
      top: originalScrollY,
      left: originalScrollX,
      behavior: 'instant'
    });

    // Fallback with simplified but reliable options
    try {
      console.log('Trying html2canvas fallback capture...');

      // Simple but effective fallback options
      const fallbackOptions = {
        scale: Math.max(window.devicePixelRatio || 1, 1.5),
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: false,
        logging: true, // Enable logging for debugging fallback
        removeContainer: true,
        imageTimeout: 10000,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        ignoreElements: (element: Element) => {
          return (
            element.classList.contains('bug-reporter-widget') ||
            element.hasAttribute('data-radix-portal') ||
            element.hasAttribute('data-sonner-toaster')
          );
        }
      };

      // Try with visible viewport first
      const fallbackCanvas = await html2canvas(document.body, fallbackOptions);

      const fallbackDataUrl = fallbackCanvas.toDataURL('image/png', 1.0);
      console.log('Fallback html2canvas capture successful:', {
        size: fallbackDataUrl.length,
        canvasSize: `${fallbackCanvas.width}x${fallbackCanvas.height}`
      });
      return fallbackDataUrl;
    } catch (fallbackError) {
      console.error('Fallback html2canvas also failed:', fallbackError);
      throw new Error('Screenshot capture failed');
    }
  }
}

// Try clipboard first, then fallback to html2canvas
async function capturePageScreenshot(): Promise<string> {
  const isMobile = isMobileDevice();

  // Option 1: Try clipboard first (for manual screenshots)
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

          console.log('Found high-quality screenshot in clipboard');
          return dataURL;
        }
      }
    } catch (error) {
      console.log('Clipboard check failed, using html2canvas:', error);
    }
  }

  // Option 2: Use html2canvas for auto-capture
  return await captureScreenshotWithHtml2Canvas();
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
      console.log('Starting html2canvas screenshot capture...');
      const screenshot = await capturePageScreenshot();
      setCapturedScreenshot(screenshot);
      console.log('Screenshot captured successfully');

      setIsOpen(true);

      toast({
        title: 'Bug Report Ready',
        description:
          'Professional-quality screenshot captured with html2canvas!',
        variant: 'default'
      });
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      setIsOpen(true);

      toast({
        title: 'Bug Report Ready',
        description: isMobileDevice()
          ? 'Screenshot failed. You can add one manually using device screenshot buttons.'
          : 'Screenshot failed. You can add one manually using Windows + Shift + S.',
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
      if ('clipboard' in navigator && 'read' in navigator.clipboard) {
        const instructionMessage = isMobile
          ? 'Mobile Screenshot:\n\n' +
            'iOS: Press Home + Power (or Volume Up + Power)\n' +
            'Android: Press Power + Volume Down\n\n' +
            'Then copy the screenshot and click OK.'
          : 'Desktop Screenshot:\n\n' +
            'Press Windows + Shift + S (Snipping Tool)\n' +
            'Select the area to capture\n' +
            'Click OK to load from clipboard';

        if (confirm(instructionMessage)) {
          const clipboardItems = await navigator.clipboard.read();

          for (const clipboardItem of clipboardItems) {
            const imageType = clipboardItem.types.find(
              (type) =>
                type.includes('image/png') || type.includes('image/jpeg')
            );

            if (imageType) {
              const blob = await clipboardItem.getType(imageType);
              const dataURL = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              setCapturedScreenshot(dataURL);
              toast({
                title: 'Manual Screenshot Added!',
                description:
                  'High-quality manual screenshot loaded successfully.',
                variant: 'default'
              });
              return;
            }
          }

          toast({
            title: 'No Screenshot Found',
            description: 'Please take a screenshot first, then try again.',
            variant: 'destructive'
          });
        }
      } else {
        toast({
          title: 'Manual Screenshot Not Available',
          description: 'Your browser does not support clipboard access.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Manual screenshot failed:', error);
      toast({
        title: 'Screenshot Failed',
        description: 'Could not access clipboard for manual screenshot.',
        variant: 'destructive'
      });
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
      const safeLogs = serializeConsoleArgs(capturedLogs);
      console.log('Console logs serialized, count:', safeLogs.length);

      const payload = {
        page_url: window.location.href,
        description: description.trim(),
        screenshot_data_url: capturedScreenshot,
        console_logs: safeLogs,
        metadata: {
          userAgent: navigator.userAgent,
          screenResolution: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
          captureMethod: capturedScreenshot ? 'html2canvas' : 'none',
          devicePixelRatio: window.devicePixelRatio
        }
      };

      console.log('Payload prepared:', {
        page_url: payload.page_url,
        description_length: payload.description.length,
        screenshot_size: payload.screenshot_data_url.length,
        console_logs_count: payload.console_logs.length
      });

      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);

        let errorMessage = 'Failed to create bug report.';
        if (errorData.error) {
          if (Array.isArray(errorData.error)) {
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

      setDescription('');
      setCapturedScreenshot('');
      setIsOpen(false);
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

  if (!isClient) return null;

  return (
    <>
      {/* Floating Bug Report Button */}
      <Button
        onClick={handleOpenBugReport}
        disabled={isCapturingScreenshot}
        className={`fixed ${
          isMobileDevice() ? 'bottom-4 right-4' : 'bottom-4 right-4'
        } z-50 rounded-full w-12 h-12 p-0 shadow-lg hover:shadow-xl transition-all duration-200 bug-reporter-widget`}
        variant='destructive'
        title={
          isCapturingScreenshot
            ? 'Capturing screenshot...'
            : 'Report a Bug (html2canvas Pro)'
        }
      >
        {isCapturingScreenshot ? (
          <Camera className='w-5 h-5 animate-pulse text-primary' />
        ) : (
          <div className='relative'>
            <Bug className='w-5 h-5 text-white' />
          </div>
        )}
      </Button>

      {/* Bug Report Modal */}
      {isOpen && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
          <Card className='w-full max-w-md max-h-[90vh] overflow-y-auto'>
            <CardHeader className='flex flex-row items-center justify-between'>
              <CardTitle className='flex items-center gap-2'>
                <Bug className='w-5 h-5' />
                Report a Bug
                <Badge variant='secondary' className='ml-2'>
                  <Zap className='w-3 h-3 mr-1' />
                  html2canvas
                </Badge>
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
                <Badge variant='outline'>
                  <Zap className='w-3 h-3 mr-1' />
                  html2canvas Pro
                </Badge>
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
                  <label className='text-sm font-medium text-green-600 flex items-center gap-2'>
                    <Zap className='w-4 h-4' />✓ Professional-quality screenshot
                    captured
                  </label>
                  <div className='mt-1 border rounded overflow-hidden'>
                    <img
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
                      Replace
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
