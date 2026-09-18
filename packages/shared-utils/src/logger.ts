export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'bearer',
  'pairingsecret',
  'privatekey',
];

/**
 * Recursively redacts sensitive keys from objects before logging
 */
export function sanitizeLogData(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    if (typeof data === 'string') {
      // Check for JWT-like strings or long hex tokens
      if (data.startsWith('Bearer ') || data.length > 80 && /^[a-f0-9]+$/i.test(data)) {
        return '[REDACTED_SECRET]';
      }
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeLogData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class Logger {
  constructor(private context: string) {}

  private format(level: LogLevel, message: string, meta?: unknown) {
    const timestamp = new Date().toISOString();
    const cleanMeta = meta ? sanitizeLogData(meta) : '';
    const metaStr = cleanMeta ? ` | ${JSON.stringify(cleanMeta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}]: ${message}${metaStr}`;
  }

  debug(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.format('debug', message, meta));
    }
  }

  info(message: string, meta?: unknown): void {
    console.info(this.format('info', message, meta));
  }

  warn(message: string, meta?: unknown): void {
    console.warn(this.format('warn', message, meta));
  }

  error(message: string, error?: unknown): void {
    const errObj = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
    console.error(this.format('error', message, errObj));
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
