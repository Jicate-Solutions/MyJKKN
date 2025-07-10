'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Bug,
  X,
  TestTube,
  Camera,
  Zap,
  Search,
  DollarSign,
  Rocket,
  IndianRupee,
  ChevronRight,
  Trophy,
  Briefcase,
  Info,
  ChevronDown
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { useRouter } from 'next/navigation';

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
  console.log('Starting html2canvas high-quality screenshot capture...', {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    title: document.title
  });

  const isMobile = isMobileDevice();

  // Store current scroll position to restore later
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  try {
    // Keep current scroll position to capture what user is seeing
    console.log('Capturing current viewport at scroll position:', {
      x: originalScrollX,
      y: originalScrollY,
      documentHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight
    });

    // Force reflow to ensure all dynamic content is rendered
    void document.body.offsetHeight;

    // html2canvas options optimized for better screenshot quality
    const options = {
      // Quality and scaling options
      scale: Math.max(window.devicePixelRatio || 1, 2), // Force minimum 2x scale for crisp images
      backgroundColor: '#ffffff', // White background to avoid transparency issues

      // Performance options
      useCORS: true, // Enable CORS for cross-origin images
      allowTaint: false, // Prevent canvas tainting for security
      removeContainer: true, // Clean up temporary DOM elements
      logging: true, // Enable logging to debug issues

      // Image handling
      imageTimeout: isMobile ? 15000 : 30000, // Timeout for loading images

      // Capture current viewport only
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,

      // Set canvas size to viewport size
      width: window.innerWidth,
      height: window.innerHeight,

      // Use current scroll position
      scrollX: originalScrollX,
      scrollY: originalScrollY,

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
      scrollPosition: `${originalScrollX},${originalScrollY}`,
      mobile: isMobile,
      targetElement: 'document.body'
    });

    // Wait longer to ensure all content is loaded
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Get a fresh reference to document.body to ensure we're capturing current state
    const targetElement = document.querySelector('body') as HTMLElement;

    if (!targetElement) {
      throw new Error('Could not find body element to capture');
    }

    const canvas = await html2canvas(targetElement, options);

    // Ensure canvas was created successfully
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas creation failed or resulted in empty canvas');
    }

    // Convert to high-quality data URL
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    // Add timestamp to data URL to prevent caching
    const timestampedDataUrl = dataUrl;

    console.log('html2canvas screenshot captured successfully:', {
      size: timestampedDataUrl.length,
      canvasSize: `${canvas.width}x${canvas.height}`,
      quality: '100%',
      timestamp: new Date().toISOString()
    });

    // No need to restore scroll position since we didn't change it

    return timestampedDataUrl;
  } catch (error) {
    console.error('html2canvas capture failed:', error);

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
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: originalScrollX,
        scrollY: originalScrollY,
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
  // Always use html2canvas for automatic captures to ensure we get the current page
  console.log('Using html2canvas for automatic page capture');
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
  const [debugMode, setDebugMode] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

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
    // Clear any previously captured screenshot to ensure fresh capture
    setCapturedScreenshot('');
    setIsCapturingScreenshot(true);

    try {
      console.log('Starting html2canvas screenshot capture...', {
        currentUrl: window.location.href,
        timestamp: new Date().toISOString()
      });

      // Force a small delay to ensure page is fully rendered
      await new Promise((resolve) => setTimeout(resolve, 100));

      const screenshot = await capturePageScreenshot();

      // Verify we got a new screenshot
      if (!screenshot || screenshot.length === 0) {
        throw new Error('Screenshot capture returned empty result');
      }

      setCapturedScreenshot(screenshot);
      console.log('Screenshot captured successfully', {
        screenshotLength: screenshot.length,
        timestamp: new Date().toISOString()
      });

      setIsOpen(true);

      toast({
        title: 'Bug Report Ready',
        description:
          'Professional-quality screenshot captured with html2canvas!',
        variant: 'default'
      });
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      setCapturedScreenshot(''); // Ensure no stale screenshot
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

        // Store full error details for debugging
        if (debugMode) {
          setTestResults(
            JSON.stringify(
              {
                status: response.status,
                statusText: response.statusText,
                errorData: errorData,
                timestamp: new Date().toISOString(),
                url: window.location.href
              },
              null,
              2
            )
          );
        }

        let errorMessage = 'Failed to create bug report.';
        let errorDetails = '';

        if (errorData.error) {
          if (Array.isArray(errorData.error)) {
            errorMessage = errorData.error
              .map((err: any) => err.message)
              .join(', ');
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
        }

        if (errorData.details) {
          errorDetails = errorData.details;
        }

        // Show specific error messages based on error codes
        if (errorData.errorCode) {
          switch (errorData.errorCode) {
            case 'AUTH_ERROR':
            case 'NO_USER':
              errorMessage = 'Authentication required. Please log in again.';
              break;
            case 'VALIDATION_ERROR':
              errorMessage = `Validation failed: ${errorDetails}`;
              break;
            case 'DB_CONNECTION_ERROR':
              errorMessage = 'Database connection failed. Please try again.';
              break;
            case 'INSERT_ERROR':
              errorMessage = `Failed to save bug report: ${errorDetails}`;
              break;
            case 'INSERT_RETRY_FAILED':
              errorMessage = 'System is busy. Please try again in a moment.';
              break;
            case 'DISPLAY_ID_GENERATION_FAILED':
              errorMessage = 'Unable to generate report ID. Please try again.';
              break;
            case 'INVALID_JSON':
              errorMessage = 'Invalid data format. Please try again.';
              break;
            default:
              errorMessage = `Error: ${errorMessage}${
                errorDetails ? ` - ${errorDetails}` : ''
              }`;
          }
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Bug report created successfully:', result);

      // Handle the new API response structure
      const successMessage =
        result.message || 'Thank you for reporting this issue!';
      const reportData = result.data || result;

      toast({
        title: 'Bug Report Submitted',
        description: `${successMessage} Redirecting to your bug reports...`,
        variant: 'default'
      });

      setDescription('');
      setCapturedScreenshot('');
      setIsOpen(false);
      capturedLogs.length = 0;

      // Auto-redirect to appropriate bug status page based on user module
      setTimeout(() => {
        const currentPath = window.location.pathname;

        // Determine the appropriate redirect path based on current location
        let redirectPath = '/my-bug-reports'; // Default admin path

        // Check various learner module patterns
        if (
          currentPath.includes('/learner/') || // Learner module pages
          currentPath.startsWith('/learner') // Learner root
        ) {
          // Confirmed learner module path
          redirectPath = '/learner/bug-reports';
        } else if (currentPath === '/') {
          // For root path, check if we have learner-specific elements
          // Only check for the most specific learner indicators
          const hasLearnerBottomNav =
            // Look for the learner bottom navigation component
            document.querySelector('.fixed.bottom-0 a[href="/learner"]') !==
              null ||
            document.querySelector('[class*="learner-bottom-navigation"]') !==
              null;

          // Check for learner-specific layout wrapper
          const hasLearnerGradient =
            document.querySelector(
              '.bg-gradient-to-br.from-slate-50.via-blue-50\\/30.to-green-50\\/20'
            ) !== null;

          if (hasLearnerBottomNav || hasLearnerGradient) {
            redirectPath = '/learner/bug-reports';
          }
          // Otherwise, keep default admin path
        }
        // For all other paths (admin module pages), use the default admin path

        console.log('Redirecting to:', redirectPath, 'from:', currentPath);
        router.push(redirectPath);
      }, 1500); // Small delay to let the user see the success message
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleOpenBugReport}
              disabled={isCapturingScreenshot}
              className={`fixed ${
                isMobileDevice() ? 'bottom-24 right-2' : 'bottom-4 right-4'
              } z-[60] bg-red-600 hover:bg-red-700 rounded-full w-12 h-12 p-0 shadow-lg hover:shadow-xl transition-all duration-200 bug-reporter-widget`}
              variant='outline'
            >
              {isCapturingScreenshot ? (
                <Camera className='w-5 h-5 animate-pulse text-primary' />
              ) : (
                <div className='relative'>
                  <Bug className='w-5 h-5 text-white' />
                </div>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side='left'
            className='bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0'
          >
            <p className='font-semibold'>
              {isCapturingScreenshot
                ? 'Capturing screenshot...'
                : 'JKKN Bug Bounty'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Bug Report Modal */}
      {isOpen && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4'>
          <Card className='w-full max-w-md max-h-[90vh] overflow-y-auto'>
            <CardHeader className='flex flex-row items-center justify-between'>
              <div className='flex flex-col items-start justify-start gap-2'>
                <CardTitle className='flex items-center gap-2'>
                  <Bug className='w-5 h-5 text-red-600' />
                  <span className='text-green-600'>JKKN Bug Bounty</span>
                </CardTitle>
                <p className='text-sm mt-1 flex items-center gap-3'>
                  <span className='flex items-center gap-1'>
                    <Search className='w-4 h-4 text-blue-500' />
                    <span className='text-muted-foreground font-semibold'>
                      Find bugs
                    </span>
                  </span>
                  <span className='text-muted-foreground'>•</span>
                  <span className='flex items-center gap-1'>
                    <IndianRupee className='w-4 h-4 text-yellow-600' />
                    <span className='text-muted-foreground font-semibold'>
                      Win Cash
                    </span>
                  </span>
                  <span className='text-muted-foreground'>•</span>
                  <span className='flex items-center gap-1'>
                    <Rocket className='w-4 h-4 text-purple-500' />
                    <span className='text-muted-foreground font-semibold'>
                      Launch Career
                    </span>
                  </span>
                </p>
              </div>
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
              {/* How it Works Toggle Button */}
              <Button
                variant='outline'
                size='sm'
                onClick={() => setShowHowItWorks(!showHowItWorks)}
                className='w-full bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200 dark:border-purple-800 hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-950/30 dark:hover:to-pink-950/30 transition-all duration-200'
              >
                <div className='flex items-center justify-between w-full'>
                  <div className='flex items-center gap-2'>
                    <div className='p-1 bg-gradient-to-br from-purple-500 to-pink-500 rounded'>
                      <Info className='w-3 h-3 text-white' />
                    </div>
                    <span className='text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                      How to Win ₹500 Weekly + Internship
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-purple-600 transition-transform duration-200 ${
                      showHowItWorks ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </Button>

              {/* How it Works Content - Collapsible */}
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  showHowItWorks ? 'max-h-100' : 'max-h-0'
                }`}
              >
                <div className='bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-purple-950/10 dark:via-pink-950/10 dark:to-indigo-950/10 rounded-lg p-4 space-y-4 border border-purple-100 dark:border-purple-900'>
                  {/* Steps with enhanced design */}
                  <div className='space-y-3'>
                    {/* Step 1 */}
                    <div className='relative'>
                      <div className='flex items-start gap-3 bg-white dark:bg-gray-900 rounded-lg p-3 shadow-sm border border-blue-100 dark:border-blue-900'>
                        <div className='relative'>
                          <div className='bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-md'>
                            1
                          </div>
                          <div className='absolute -bottom-1 -right-1 w-3 h-3 bg-blue-300 rounded-full animate-pulse'></div>
                        </div>
                        <div className='flex-1'>
                          <p className='text-sm font-semibold flex items-center gap-2'>
                            <Search className='w-4 h-4 text-blue-500' />
                            Find & Report Bugs
                          </p>
                          <p className='text-xs text-muted-foreground mt-1'>
                            Use MyJKKN platform daily. Spot issues. Click the
                            bug reporter.
                          </p>
                          <div className='flex flex-wrap gap-1 mt-2'>
                            <Badge
                              variant='secondary'
                              className='text-xs py-0 px-1.5'
                            >
                              UI Issues
                            </Badge>
                            <Badge
                              variant='secondary'
                              className='text-xs py-0 px-1.5'
                            >
                              Functionality
                            </Badge>
                            <Badge
                              variant='secondary'
                              className='text-xs py-0 px-1.5'
                            >
                              Performance
                            </Badge>
                            <Badge
                              variant='secondary'
                              className='text-xs py-0 px-1.5'
                            >
                              Security
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {/* Connector */}
                      <div className='absolute left-4 top-12 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-green-300'></div>
                    </div>

                    {/* Step 2 */}
                    <div className='relative'>
                      <div className='flex items-start gap-3 bg-white dark:bg-gray-900 rounded-lg p-3 shadow-sm border border-green-100 dark:border-green-900'>
                        <div className='relative'>
                          <div className='bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-md'>
                            2
                          </div>
                          <div className='absolute -bottom-1 -right-1 w-3 h-3 bg-green-300 rounded-full animate-pulse'></div>
                        </div>
                        <div className='flex-1'>
                          <p className='text-sm font-semibold flex items-center gap-2'>
                            <Trophy className='w-4 h-4 text-green-500' />
                            Win ₹500 Weekly
                          </p>
                          <p className='text-xs text-muted-foreground mt-1'>
                            Top bug hunter each week wins cash prize. Winners
                            announced every Monday!
                          </p>
                          <div className='flex items-center gap-3 mt-2'>
                            <Badge className='bg-green-100 hover:text-white text-green-700 dark:bg-green-950 dark:text-green-300 text-xs'>
                              <IndianRupee className='w-3 h-3 mr-1' />
                              Direct Bank Transfer
                            </Badge>
                            <span className='text-xs text-muted-foreground'>
                              Within 24 hours
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Connector */}
                      <div className='absolute left-4 top-12 bottom-0 w-0.5 bg-gradient-to-b from-green-300 to-purple-300'></div>
                    </div>

                    {/* Step 3 */}
                    <div className='relative'>
                      <div className='flex items-start gap-3 bg-white dark:bg-gray-900 rounded-lg p-3 shadow-sm border border-purple-100 dark:border-purple-900'>
                        <div className='relative'>
                          <div className='bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-md'>
                            3
                          </div>
                          <div className='absolute -bottom-1 -right-1 w-3 h-3 bg-purple-300 rounded-full animate-pulse'></div>
                        </div>
                        <div className='flex-1'>
                          <p className='text-sm font-semibold flex items-center gap-2'>
                            <Briefcase className='w-4 h-4 text-purple-500' />
                            Get Jicate Internship
                          </p>
                          <p className='text-xs text-muted-foreground mt-1'>
                            Win 3 times (any weeks) = 3-month paid internship at
                            Jicate Solutions!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
              </div>

              {/* Motivational Footer */}
              <div className='text-center pt-2'>
                <p className='text-xs text-muted-foreground'>
                  Your journey from{' '}
                  <span className='font-medium text-foreground'>
                    bug hunter
                  </span>{' '}
                  to{' '}
                  <span className='font-medium text-foreground'>
                    software developer
                  </span>{' '}
                  starts here!
                </p>
              </div>

              {testResults && (
                <div className='mt-4'>
                  <h4 className='text-sm font-medium mb-2'>
                    {debugMode ? 'Debug Results:' : 'Test Results:'}
                  </h4>
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
