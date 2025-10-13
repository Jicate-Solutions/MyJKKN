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
  module: string;
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
  topModules: { module: string; count: number }[];
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
    module: string,
    component?: string
  ): string {
    const componentPart = component ? `:${component}` : '';
    return `${type}:${module}${componentPart}:${message.substring(0, 200)}`;
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
      const module = this.extractModule();
      const stackTrace = this.getTruncatedStack();
      const component = stackTrace ? this.extractComponentName(stackTrace) : undefined;

      const hash = this.generateHash(type, message, module, component);

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
          module,
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
      if (!grouped[log.module]) {
        grouped[log.module] = [];
      }
      grouped[log.module].push(log);
    }

    // Sort each module's logs by count (descending)
    for (const module in grouped) {
      grouped[module].sort((a, b) => b.count - a.count);
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
      const current = moduleCounts.get(log.module) || 0;
      moduleCounts.set(log.module, current + log.count);
    }

    const topModules = Array.from(moduleCounts.entries())
      .map(([module, count]) => ({ module, count }))
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

// Global instance
let globalLogManager: LogManager | null = null;

/**
 * Get or create the global LogManager instance
 */
export function getLogManager(): LogManager {
  if (!globalLogManager) {
    globalLogManager = new LogManager(1000);
  }
  return globalLogManager;
}

/**
 * Enhanced Logger API for manual logging
 */
export const logger = {
  /**
   * Development-only log (will not appear in production)
   */
  dev(module: string, message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${module}]`;
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
  log(module: string, message: string, data?: any): void {
    const prefix = `[${module}]`;
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  },

  /**
   * Info log
   */
  info(module: string, message: string, data?: any): void {
    const prefix = `[${module}]`;
    if (data !== undefined) {
      console.info(prefix, message, data);
    } else {
      console.info(prefix, message);
    }
  },

  /**
   * Warning log
   */
  warn(module: string, message: string, data?: any): void {
    const prefix = `[${module}]`;
    if (data !== undefined) {
      console.warn(prefix, message, data);
    } else {
      console.warn(prefix, message);
    }
  },

  /**
   * Error log
   */
  error(module: string, message: string, error?: any): void {
    const prefix = `[${module}]`;
    if (error !== undefined) {
      console.error(prefix, message, error);
    } else {
      console.error(prefix, message);
    }
  },

  /**
   * Debug log (development only)
   */
  debug(module: string, message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${module}]`;
      if (data !== undefined) {
        console.debug(prefix, message, data);
      } else {
        console.debug(prefix, message);
      }
    }
  }
};

/**
 * Initialize log capture (called by bug reporter widget)
 */
export function initializeLogCapture(): void {
  if (typeof window === 'undefined') return;

  const manager = getLogManager();
  const originalConsole = { ...console };

  const logTypes: LogType[] = ['log', 'warn', 'error', 'info', 'debug'];

  logTypes.forEach((type) => {
    (console as any)[type] = (...args: any[]) => {
      // Add to log manager
      manager.addLog(type, args);

      // Call original console method
      (originalConsole as any)[type](...args);
    };
  });
}
