export * from './errors';
export * from './messages';

import { ProtocolEnvelope } from './messages';
import { ProtocolErrorCode, RemoteDevError } from './errors';

/**
 * Helper to construct a typed protocol envelope
 */
export function createEnvelope<T>(
  type: string,
  payload?: T,
  options?: {
    requestId?: string;
    source?: string;
    target?: string;
    success?: boolean;
    error?: { code: ProtocolErrorCode; message: string; details?: Record<string, unknown> };
  }
): ProtocolEnvelope<T> {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    requestId: options?.requestId,
    source: options?.source,
    target: options?.target,
    timestamp: Date.now(),
    success: options?.success ?? true,
    error: options?.error,
    payload,
  };
}

/**
 * Helper to create an error envelope response
 */
export function createErrorEnvelope(
  requestId: string,
  code: ProtocolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ProtocolEnvelope<never> {
  return {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type: 'error',
    requestId,
    timestamp: Date.now(),
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Safe JSON parser with ProtocolEnvelope validation
 */
export function parseProtocolMessage(raw: string): ProtocolEnvelope {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      throw new RemoteDevError('INTERNAL_ERROR', 'Invalid protocol frame structure');
    }
    return parsed as ProtocolEnvelope;
  } catch (err: any) {
    if (err instanceof RemoteDevError) throw err;
    throw new RemoteDevError('INTERNAL_ERROR', `Malformed JSON frame: ${err.message}`);
  }
}
