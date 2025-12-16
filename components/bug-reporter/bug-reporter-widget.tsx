'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  ChevronDown,
  AlertCircle,
  Lightbulb,
  Palette,
  Gauge,
  Shield
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { useRouter } from 'next/navigation';
import {
  getLogManager,
  initializeLogCapture,
  logger
} from '@/lib/utils/enhanced-logger';
import toast from 'react-hot-toast';

// Initialize enhanced log capture with deduplication
if (typeof window !== 'undefined') {
  initializeLogCapture();
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

// Maximum screenshot size limits to prevent API request size issues
const MAX_SCREENSHOT_WIDTH = 1920;
const MAX_SCREENSHOT_HEIGHT = 2500;
const MAX_SCREENSHOT_SIZE_BYTES = 2 * 1024 * 1024; // 2MB max (Vercel limit is 4.5MB, leave room for other data)
const JPEG_QUALITY = 0.75; // 75% quality for good balance of size/quality

// Compress and resize screenshot to fit within size limits
async function compressScreenshot(dataUrl: string, maxSizeBytes: number = MAX_SCREENSHOT_SIZE_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        // Scale down if exceeds max dimensions
        if (width > MAX_SCREENSHOT_WIDTH) {
          const ratio = MAX_SCREENSHOT_WIDTH / width;
          width = MAX_SCREENSHOT_WIDTH;
          height = Math.round(height * ratio);
        }

        if (height > MAX_SCREENSHOT_HEIGHT) {
          const ratio = MAX_SCREENSHOT_HEIGHT / height;
          height = MAX_SCREENSHOT_HEIGHT;
          width = Math.round(width * ratio);
        }

        // Create canvas for compression
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw image to canvas (this resizes it)
        ctx.drawImage(img, 0, 0, width, height);

        // Try different quality levels until we hit target size
        let quality = JPEG_QUALITY;
        let result = canvas.toDataURL('image/jpeg', quality);

        // Progressively reduce quality if still too large
        while (result.length > maxSizeBytes && quality > 0.3) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        // If still too large, reduce dimensions further
        if (result.length > maxSizeBytes) {
          const scaleFactor = Math.sqrt(maxSizeBytes / result.length);
          canvas.width = Math.round(width * scaleFactor);
          canvas.height = Math.round(height * scaleFactor);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL('image/jpeg', 0.5);
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = dataUrl;
  });
}

// High-quality screenshot capture using html2canvas with best practices
async function captureScreenshotWithHtml2Canvas(): Promise<string> {
  const isMobile = isMobileDevice();

  // Store current scroll position to restore later
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  try {
    // Calculate full page dimensions for complete capture
    const fullPageWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.offsetWidth,
      document.documentElement.clientWidth
    );
    const fullPageHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight
    );

    // Force reflow to ensure all dynamic content is rendered
    void document.body.offsetHeight;

    // html2canvas options optimized for FULL PAGE screenshot capture
    // FIX 2025-12-05: Reduced scale to prevent oversized screenshots that exceed API limits
    const options = {
      // Quality and scaling options - cap at 1.5x to prevent huge images
      scale: Math.min(window.devicePixelRatio || 1, 1.5), // Cap scale to prevent huge screenshots
      backgroundColor: '#ffffff', // White background to avoid transparency issues

      // Performance options
      useCORS: true, // Enable CORS for cross-origin images
      allowTaint: false, // Prevent canvas tainting for security
      removeContainer: true, // Clean up temporary DOM elements
      logging: true, // Enable logging to debug issues

      // Image handling
      imageTimeout: isMobile ? 15000 : 30000, // Timeout for loading images

      // FULL PAGE CAPTURE - Updated 2025-11-17
      // Capture the entire document, not just viewport
      windowWidth: fullPageWidth,
      windowHeight: fullPageHeight,

      // Set canvas size to full page dimensions
      width: fullPageWidth,
      height: fullPageHeight,

      // Start from top of page (0,0) to capture everything
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
            logger.warn('bug-reports', 'Failed to remove overlay elements', e);
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
          logger.warn('bug-reports', 'Failed to add quality styles', e);
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
          logger.warn('bug-reports', 'Failed to add timestamp', e);
        }
      }
    };

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

    // Convert to JPEG with compression (much smaller than PNG)
    // FIX 2025-12-05: Use JPEG format to reduce file size
    const rawDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    // Compress the screenshot to ensure it's within size limits
    const compressedDataUrl = await compressScreenshot(rawDataUrl);

    return compressedDataUrl;
  } catch (error) {
    logger.error('bug-reports', 'html2canvas capture failed', error);

    // Fallback with simplified but reliable options
    try {

      // Calculate full page dimensions for fallback too
      const fallbackFullWidth = Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth
      );
      const fallbackFullHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.documentElement.clientHeight
      );

      // Simple but effective fallback options - FULL PAGE
      // FIX 2025-12-05: Reduced scale in fallback too
      const fallbackOptions = {
        scale: Math.min(window.devicePixelRatio || 1, 1.5), // Cap scale
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: false,
        logging: true, // Enable logging for debugging fallback
        removeContainer: true,
        imageTimeout: 10000,
        // Fallback also captures full page but with size limits
        windowWidth: Math.min(fallbackFullWidth, MAX_SCREENSHOT_WIDTH),
        windowHeight: Math.min(fallbackFullHeight, MAX_SCREENSHOT_HEIGHT),
        width: Math.min(fallbackFullWidth, MAX_SCREENSHOT_WIDTH),
        height: Math.min(fallbackFullHeight, MAX_SCREENSHOT_HEIGHT),
        scrollX: 0,
        scrollY: 0,
        ignoreElements: (element: Element) => {
          return (
            element.classList.contains('bug-reporter-widget') ||
            element.hasAttribute('data-radix-portal') ||
            element.hasAttribute('data-sonner-toaster')
          );
        }
      };

      // Capture full page with fallback options
      const fallbackCanvas = await html2canvas(document.body, fallbackOptions);

      // Use JPEG and compress
      const rawFallbackDataUrl = fallbackCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const compressedFallbackDataUrl = await compressScreenshot(rawFallbackDataUrl);

      return compressedFallbackDataUrl;
    } catch (fallbackError) {
      logger.error('bug-reports', 'Fallback html2canvas also failed', fallbackError);
      throw new Error('Screenshot capture failed');
    }
  }
}

// Try clipboard first, then fallback to html2canvas
async function capturePageScreenshot(): Promise<string> {
  // Always use html2canvas for automatic captures to ensure we get the current page
  return await captureScreenshotWithHtml2Canvas();
}

export function BugReporterWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('bug');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [capturedScreenshot, setCapturedScreenshot] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  const [testResults, setTestResults] = useState<string>('');
  const [debugMode, setDebugMode] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const runTest = async () => {
    try {
      const response = await fetch('/api/bug-reports/test');
      const result = await response.json();

      setTestResults(JSON.stringify(result, null, 2));

      toast.success(result.success ? 'Test Passed' : 'Test Failed');
    } catch (error: any) {
      logger.error('bug-reports', 'Test failed', error);
      setTestResults(
        `Test failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      toast.error(error instanceof Error ? error.message : 'Unknown error');
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

      toast.success('Bug Report Ready');
    } catch (error: any) {
      console.error('Failed to capture screenshot:', error);
      setCapturedScreenshot(''); // Ensure no stale screenshot
      setIsOpen(true);
      toast.error(error instanceof Error ? error.message : 'Unknown error');
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
              toast.success('Manual Screenshot Added!');
              return;
            }
          }

          toast.error('No Screenshot Found');
        }
      } else {
        toast.error('Manual Screenshot Not Available');
      }
    } catch (error: any) {
      console.error('Manual screenshot failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const handleSubmit = async () => {
    if (!description || description.trim().length < 10) {
      toast.error('Please provide a description of at least 10 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('Starting bug report submission...');

      // Get structured logs from enhanced logger
      const logManager = getLogManager();
      const structuredLogs = logManager.getStructuredLogs();

      // Prepare simplified logs for storage
      const simplifiedLogs = structuredLogs.allLogs.map((log) => ({
        type: log.type,
        message: log.message,
        module: log.moduleName,
        component: log.component,
        count: log.count,
        firstSeen: log.firstSeen,
        lastSeen: log.lastSeen
      }));

      const safeLogs = serializeConsoleArgs(simplifiedLogs);
      console.log('Console logs serialized:', {
        uniqueEntries: structuredLogs.summary.totalUniqueEntries,
        totalOccurrences: structuredLogs.summary.totalOccurrences
      });

      const payload = {
        page_url: window.location.href,
        description: description.trim(),
        category: category,
        screenshot_data_url: capturedScreenshot,
        console_logs: safeLogs,
        log_summary: structuredLogs.summary, // Add structured summary
        metadata: {
          userAgent: navigator.userAgent,
          screenResolution: `${screen.width}x${screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
          captureMethod: capturedScreenshot ? 'html2canvas' : 'none',
          devicePixelRatio: window.devicePixelRatio,
          // Add log statistics
          logStats: {
            uniqueEntries: structuredLogs.summary.totalUniqueEntries,
            totalOccurrences: structuredLogs.summary.totalOccurrences,
            topModules: structuredLogs.summary.topModules.slice(0, 5)
          }
        }
      };

      // Check payload size before sending (Vercel limit is 4.5MB)
      const payloadString = JSON.stringify(payload);
      const payloadSizeKB = payloadString.length / 1024;
      const payloadSizeMB = payloadSizeKB / 1024;

      console.log('Payload prepared:', {
        page_url: payload.page_url,
        description_length: payload.description.length,
        screenshot_size: `${(payload.screenshot_data_url.length / 1024).toFixed(0)}KB`,
        console_logs_count: payload.console_logs.length,
        total_payload_size: `${payloadSizeKB.toFixed(0)}KB (${payloadSizeMB.toFixed(2)}MB)`
      });

      // Warn if payload is approaching limit (4MB warning threshold)
      if (payloadSizeMB > 4) {
        console.warn('[BugReporter] Payload is very large, may fail:', `${payloadSizeMB.toFixed(2)}MB`);
        // Try to compress screenshot further if it's too large
        if (payload.screenshot_data_url.length > 1.5 * 1024 * 1024) {
          console.log('[BugReporter] Re-compressing screenshot to reduce payload size...');
          const recompressed = await compressScreenshot(payload.screenshot_data_url, 1 * 1024 * 1024);
          payload.screenshot_data_url = recompressed;
          console.log('[BugReporter] Screenshot re-compressed to:', `${(recompressed.length / 1024).toFixed(0)}KB`);
        }
      }

      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // FIX 2025-12-05: Handle non-JSON responses (e.g., "Request Entity Too Large" from Vercel)
        let errorData: any = null;
        const contentType = response.headers.get('content-type');

        try {
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            // Response is not JSON (e.g., plain text error from infrastructure)
            const textResponse = await response.text();
            console.error('Non-JSON error response:', textResponse);

            // Handle common HTTP errors
            if (response.status === 413 || textResponse.includes('Request Entity Too Large')) {
              throw new Error('Screenshot is too large. Please try with a smaller screenshot or remove it and try again.');
            }
            if (response.status === 408 || textResponse.includes('Request Timeout')) {
              throw new Error('Request timed out. Please try again.');
            }
            if (response.status === 502 || response.status === 503 || response.status === 504) {
              throw new Error('Server is temporarily unavailable. Please try again in a moment.');
            }

            errorData = { error: textResponse || response.statusText };
          }
        } catch (parseError) {
          // If parsing fails, check if it's an infrastructure error
          console.error('Error parsing response:', parseError);

          if (parseError instanceof Error && parseError.message.includes('Screenshot is too large')) {
            throw parseError;
          }

          // Generic error for unparseable responses
          throw new Error('Server error. Please try again or remove the screenshot if the issue persists.');
        }

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

        if (errorData?.error) {
          if (Array.isArray(errorData.error)) {
            errorMessage = errorData.error
              .map((err: any) => err.message)
              .join(', ');
          } else if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
        }

        if (errorData?.details) {
          errorDetails = errorData.details;
        }

        // Show specific error messages based on error codes
        if (errorData?.errorCode) {
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

      toast.success(`${successMessage} Redirecting to your bug reports...`);

      setDescription('');
      setCategory('bug');
      setCapturedScreenshot('');
      setIsOpen(false);

      // Clear logs from enhanced logger (reuse logManager from try block)
      logManager.clear();

      // Auto-redirect to appropriate bug status page based on user module
      setTimeout(() => {
        const currentPath = window.location.pathname;

        // Determine the appropriate redirect path based on current location
        const redirectPath = '/my-bug-reports'; // Default admin path

        // All users now go to admin bug reports since learner module is removed

        console.log('Redirecting to:', redirectPath, 'from:', currentPath);
        router.push(redirectPath);
      }, 1500); // Small delay to let the user see the success message
    } catch (error: any) {
      console.error('Bug report submission failed:', error);
      toast.error(
        error instanceof Error ? error.message : 'An unexpected error occurred.'
      );
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
                  setCategory('bug');
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

              {/* Category Selection */}
              <div>
                <label className='text-sm font-medium mb-2 block'>
                  Category *
                </label>
                <div className='grid grid-cols-2 gap-2'>
                  <button
                    type='button'
                    onClick={() => setCategory('bug')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === 'bug'
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-red-300'
                    }`}
                  >
                    <div className='flex flex-col items-center gap-1'>
                      <AlertCircle
                        className={`w-5 h-5 ${
                          category === 'bug'
                            ? 'text-red-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='text-xs font-medium'>Bug/Issue</span>
                    </div>
                  </button>

                  <button
                    type='button'
                    onClick={() => setCategory('feature_request')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === 'feature_request'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className='flex flex-col items-center gap-1'>
                      <Lightbulb
                        className={`w-5 h-5 ${
                          category === 'feature_request'
                            ? 'text-blue-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='text-xs font-medium'>New Feature</span>
                    </div>
                  </button>

                  <button
                    type='button'
                    onClick={() => setCategory('ui_design')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === 'ui_design'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <div className='flex flex-col items-center gap-1'>
                      <Palette
                        className={`w-5 h-5 ${
                          category === 'ui_design'
                            ? 'text-purple-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='text-xs font-medium'>UI/Design</span>
                    </div>
                  </button>

                  <button
                    type='button'
                    onClick={() => setCategory('performance')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === 'performance'
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    <div className='flex flex-col items-center gap-1'>
                      <Gauge
                        className={`w-5 h-5 ${
                          category === 'performance'
                            ? 'text-orange-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='text-xs font-medium'>Performance</span>
                    </div>
                  </button>

                  <button
                    type='button'
                    onClick={() => setCategory('security')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === 'security'
                        ? 'border-yellow-600 bg-yellow-50 dark:bg-yellow-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-yellow-400'
                    }`}
                  >
                    <div className='flex flex-col items-center gap-1'>
                      <Shield
                        className={`w-5 h-5 ${
                          category === 'security'
                            ? 'text-yellow-600'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='text-xs font-medium'>Security</span>
                    </div>
                  </button>

                  <button
                    type='button'
                    onClick={() => setCategory('other')}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      category === 'other'
                        ? 'border-gray-500 bg-gray-50 dark:bg-gray-950/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className='flex flex-col items-center gap-1'>
                      <Bug
                        className={`w-5 h-5 ${
                          category === 'other'
                            ? 'text-gray-500'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className='text-xs font-medium'>Other</span>
                    </div>
                  </button>
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
                    {/* Use native img for base64 data URLs to avoid Next.js Image warnings */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
