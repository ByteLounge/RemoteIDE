"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.sanitizeLogData = sanitizeLogData;
exports.createLogger = createLogger;
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
function sanitizeLogData(data) {
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
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
            result[key] = '[REDACTED]';
        }
        else if (typeof value === 'object' && value !== null) {
            result[key] = sanitizeLogData(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
class Logger {
    context;
    constructor(context) {
        this.context = context;
    }
    format(level, message, meta) {
        const timestamp = new Date().toISOString();
        const cleanMeta = meta ? sanitizeLogData(meta) : '';
        const metaStr = cleanMeta ? ` | ${JSON.stringify(cleanMeta)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] [${this.context}]: ${message}${metaStr}`;
    }
    debug(message, meta) {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(this.format('debug', message, meta));
        }
    }
    info(message, meta) {
        console.info(this.format('info', message, meta));
    }
    warn(message, meta) {
        console.warn(this.format('warn', message, meta));
    }
    error(message, error) {
        const errObj = error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error;
        console.error(this.format('error', message, errObj));
    }
}
exports.Logger = Logger;
function createLogger(context) {
    return new Logger(context);
}
