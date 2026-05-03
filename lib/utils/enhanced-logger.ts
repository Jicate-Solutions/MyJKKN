/**
 * Enhanced Logger Utility for MyJKKN
 *
 * Features:
 * - Smart deduplication of logs
 * - Module-based categorization
 * - Component name extraction
 * - Occurrence counting
 * - Optimized for bug reporter integration
 *
 * @module enhanced-logger
 */

export type LogType = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  moduleName: string;
  component?: string;
  timestamp: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  stackTrace?: string;
  args?: any[];
}

export interface LogSummary {
  totalUniqueEntries: number;
  totalOccurrences: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  logCount: number;
  debugCount: number;
  topModules: { moduleName: string; count: number }[];
  criticalErrors: LogEntry[];
}

export interface StructuredLogs {
  summary: LogSummary;
  logsByModule: Record<string, LogEntry[]>;
  recentLogs: LogEntry[];
  allLogs: LogEntry[];
}

/**
 * LogManager - Manages console log capture with deduplication
 */
export class LogManager {
  private logs: Map<string, LogEntry> = new Map();
  private maxLogs: number = 1000;
  private logOrder: string[] = []; // Track order for recent logs

  constructor(maxLogs: number = 1000) {
    this.maxLogs = maxLogs;
  }

  /**
   * Generate a unique hash for a log entry
   */
  private generateHash(
    type: LogType,
    message: string,
    moduleName: string,
    component?: string
  ): string {
    const componentPart = component ? `:${component}` : '';
    return `${type}:${moduleName}${componentPart}:${message.substring(0, 200)}`;
  }

  /**
   * Extract module name from current URL path
   * Examples:
   * /academic/timetables/[id] -> academic/timetables
   * /billing/schedule/students -> billing/schedule
   * / -> home
   */
  private extractModule(): string {
    if (typeof window === 'undefined') return 'server';

    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) return 'home';

    // Take first 2-3 segments, excluding dynamic route segments like [id]
    const moduleSegments = segments
      .slice(0, 3)
      .filter(seg => !seg.startsWith('[') && !seg.match(/^[0-9a-f-]{36}$/i)); // Filter out UUIDs

    return moduleSegments.join('/') || 'unknown';
  }

  /**
   * Extract React component name from stack trace
   */
  private extractComponentName(stackTrace: string): string | undefined {
    try {
      // Look for React component patterns in stack trace
      const componentMatch = stackTrace.match(/at (\w+)\s*\(/);
      if (componentMatch && componentMatch[1]) {
        // Capitalize first letter if it's a React component
        const name = componentMatch[1];
        if (name[0] === name[0].toUpperCase()) {
          return name;
        }
      }
    } catch (error) {
      // Silently fail
    }
    return undefined;
  }

  /**
   * Get a truncated stack trace for deduplication
   */
  private getTruncatedStack(): string | undefined {
    try {
      const stack = new Error().stack;
      if (!stack) return undefined;

      const lines = stack.split('\n').slice(3, 6); // Skip Error and LogManager calls
      return lines.join('\n');
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Serialize console arguments to string
   */
  private serializeMessage(args: any[]): string {
    return args
      .map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
  }

  /**
   * Add a log entry (with automatic deduplication)
   */
  addLog(type: LogType, args: any[]): void {
    try {
      const message = this.serializeMessage(args);
      const moduleName = this.extractModule();
      const stackTrace = this.getTruncatedStack();
      const component = stackTrace ? this.extractComponentName(stackTrace) : undefined;

      const hash = this.generateHash(type, message, moduleName, component);

      const now = new Date().toISOString();

      if (this.logs.has(hash)) {
        // Increment count for existing log
        const existing = this.logs.get(hash)!;
        existing.count++;
        existing.lastSeen = now;
        existing.args = args; // Update with latest args
      } else {
        // Add new log entry
        if (this.logs.size >= this.maxLogs) {
          // Remove oldest log when limit reached
          const oldestHash = this.logOrder.shift();
          if (oldestHash) {
            this.logs.delete(oldestHash);
          }
        }

        const entry: LogEntry = {
          id: hash,
          type,
          message,
          moduleName,
          component,
          timestamp: now,
          count: 1,
          firstSeen: now,
          lastSeen: now,
          stackTrace,
          args
        };

        this.logs.set(hash, entry);
        this.logOrder.push(hash);
      }
    } catch (error) {
      // Silently fail to avoid infinite loops
      console.error('LogManager error:', error);
    }
  }

  /**
   * Get all logs as array
   */
  getAllLogs(): LogEntry[] {
    return Array.from(this.logs.values());
  }

  /**
   * Get logs grouped by module
   */
  getLogsByModule(): Record<string, LogEntry[]> {
    const grouped: Record<string, LogEntry[]> = {};

    for (const log of this.logs.values()) {
      if (!grouped[log.moduleName]) {
        grouped[log.moduleName] = [];
      }
      grouped[log.moduleName].push(log);
    }

    // Sort each module's logs by count (descending)
    for (const moduleKey in grouped) {
      grouped[moduleKey].sort((a, b) => b.count - a.count);
    }

    return grouped;
  }

  /**
   * Get recent logs (last 50)
   */
  getRecentLogs(limit: number = 50): LogEntry[] {
    const recentHashes = this.logOrder.slice(-limit);
    return recentHashes
      .map(hash => this.logs.get(hash))
      .filter((log): log is LogEntry => log !== undefined)
      .reverse(); // Most recent first
  }

  /**
   * Get critical errors only
   */
  getCriticalErrors(): LogEntry[] {
    return Array.from(this.logs.values())
      .filter(log => log.type === 'error')
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate summary statistics
   */
  getSummary(): LogSummary {
    const logs = this.getAllLogs();
    const totalOccurrences = logs.reduce((sum, log) => sum + log.count, 0);

    const counts = {
      error: 0,
      warn: 0,
      info: 0,
      log: 0,
      debug: 0
    };

    for (const log of logs) {
      counts[log.type]++;
    }

    // Calculate top modules
    const moduleCounts = new Map<string, number>();
    for (const log of logs) {
      const current = moduleCounts.get(log.moduleName) || 0;
      moduleCounts.set(log.moduleName, current + log.count);
    }

    const topModules = Array.from(moduleCounts.entries())
      .map(([moduleKey, count]) => ({ moduleName: moduleKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalUniqueEntries: logs.length,
      totalOccurrences,
      errorCount: counts.error,
      warnCount: counts.warn,
      infoCount: counts.info,
      logCount: counts.log,
      debugCount: counts.debug,
      topModules,
      criticalErrors: this.getCriticalErrors().slice(0, 10)
    };
  }

  /**
   * Get structured logs for bug reporter
   */
  getStructuredLogs(): StructuredLogs {
    return {
      summary: this.getSummary(),
      logsByModule: this.getLogsByModule(),
      recentLogs: this.getRecentLogs(50),
      allLogs: this.getAllLogs()
    };
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs.clear();
    this.logOrder = [];
  }

  /**
   * Get current log count
   */
  getCount(): number {
    return this.logs.size;
  }

  /**
   * Get total occurrences
   */
  getTotalOccurrences(): number {
    return Array.from(this.logs.values()).reduce((sum, log) => sum + log.count, 0);
  }
}

// Global instance — must survive HMR re-evaluations, so stored on window
declare global {
  interface Window {
    __jkknLogManager?: LogManager;
    __jkknLogCaptureInitialized?: boolean;
  }
}

/**
 * Get or create the global LogManager instance.
 * Stored on window so Hot Module Replacement doesn't lose captured logs.
 */
export function getLogManager(): LogManager {
  if (typeof window === 'undefined') {
    // SSR fallback — ephemeral instance, never stored
    return new LogManager(1000);
  }
  if (!window.__jkknLogManager) {
    window.__jkknLogManager = new LogManager(1000);
  }
  return window.__jkknLogManager;
}

/**
 * Convert any thrown value into a plain enumerable object suitable for
 * `console.error` / structured logs. Browsers (V8) render Supabase
 * `PostgrestError` and supabase-js auth errors as `{}` because their
 * fields land on the prototype or get non-enumerable across boundaries —
 * spreading into a fresh literal sidesteps that formatter.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err == null) return { raw: err };

  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
    const e = err as Error &
      Partial<Record<'code' | 'status' | 'details' | 'hint', unknown>>;
    if (e.code !== undefined) out.code = e.code;
    if (e.status !== undefined) out.status = e.status;
    if (e.details !== undefined) out.details = e.details;
    if (e.hint !== undefined) out.hint = e.hint;
    return out;
  }

  if (typeof err === 'object') {
    const source = err as Record<string, unknown>;
    const out: Record<string, unknown> = { ...source };
    for (const k of [
      'code',
      'status',
      'message',
      'details',
      'hint',
      'name'
    ] as const) {
      const v = source[k];
      if (v !== undefined && !(k in out)) out[k] = v;
    }
    if (Object.keys(out).length === 0) {
      out.raw =
        '<empty error object — likely failed fetch, blocked request, or stale auth refresh>';
    }
    return out;
  }

  return { raw: String(err) };
}

/**
 * Enhanced Logger API for manual logging
 */
export const logger = {
  /**
   * Development-only log (will not appear in production)
   */
  dev(moduleName: string, message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${moduleName}]`;
      if (data !== undefined) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  },

  /**
   * Production log (appears in both dev and production)
   */
  log(moduleName: string, message: string, data?: any): void {
    const prefix = `[${moduleName}]`;
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  },

  /**
   * Info log
   */
  info(moduleName: string, message: string, data?: any): void {
    const prefix = `[${moduleName}]`;
    if (data !== undefined) {
      console.info(prefix, message, data);
    } else {
      console.info(prefix, message);
    }
  },

  /**
   * Warning log
   */
  warn(moduleName: string, message: string, data?: any): void {
    const prefix = `[${moduleName}]`;
    if (data !== undefined) {
      console.warn(prefix, message, data);
    } else {
      console.warn(prefix, message);
    }
  },

  /**
   * Error log
   */
  error(moduleName: string, message: string, error?: any): void {
    const prefix = `[${moduleName}]`;
    if (error !== undefined) {
      console.error(prefix, message, error);
    } else {
      console.error(prefix, message);
    }
  },

  /**
   * Debug log (development only)
   */
  debug(moduleName: string, message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${moduleName}]`;
      if (data !== undefined) {
        console.debug(prefix, message, data);
      } else {
        console.debug(prefix, message);
      }
    }
  }
};

/**
 * Initialize log capture (called by bug reporter widget).
 * Guards against double-initialization so HMR re-evaluations are safe.
 * Also captures uncaught errors and unhandled promise rejections which
 * never go through console.error.
 */
export function initializeLogCapture(): void {
  if (typeof window === 'undefined') return;
  if (window.__jkknLogCaptureInitialized) return;
  window.__jkknLogCaptureInitialized = true;

  const manager = getLogManager();

  // Snapshot native methods BEFORE any wrapping occurs
  const nativeLog = console.log.bind(console);
  const nativeWarn = console.warn.bind(console);
  const nativeError = console.error.bind(console);
  const nativeInfo = console.info.bind(console);
  const nativeDebug = console.debug.bind(console);

  const nativeMethods: Record<LogType, (...args: any[]) => void> = {
    log: nativeLog,
    warn: nativeWarn,
    error: nativeError,
    info: nativeInfo,
    debug: nativeDebug
  };

  const logTypes: LogType[] = ['log', 'warn', 'error', 'info', 'debug'];

  logTypes.forEach((type) => {
    (console as any)[type] = (...args: any[]) => {
      manager.addLog(type, args);
      nativeMethods[type](...args);
    };
  });

  // Capture uncaught synchronous errors (bypass console entirely)
  window.addEventListener('error', (event) => {
    const msg = event.error instanceof Error
      ? `Uncaught ${event.error.name}: ${event.error.message}`
      : `Uncaught Error: ${event.message}`;
    manager.addLog('error', [
      msg,
      { filename: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error?.stack }
    ]);
  });

  // Capture unhandled promise rejections (async throws, failed fetches, etc.)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error
      ? `Unhandled Promise Rejection: ${reason.name}: ${reason.message}`
      : `Unhandled Promise Rejection: ${String(reason)}`;
    manager.addLog('error', [msg, reason instanceof Error ? { stack: reason.stack } : reason]);
  });
}
