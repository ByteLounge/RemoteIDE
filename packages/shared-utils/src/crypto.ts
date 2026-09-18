import crypto from 'crypto';

/**
 * Generates an ephemeral 6-digit pairing code (e.g. "742 193")
 */
export function generatePairingCode(): { formatted: string; raw: string } {
  const num = crypto.randomInt(100000, 999999).toString();
  const formatted = `${num.slice(0, 3)} ${num.slice(3, 6)}`;
  return { formatted, raw: num };
}

/**
 * Generates a high-entropy random token
 */
export function generateToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Computes SHA-256 hash of a string or buffer
 */
export function hashContent(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generates a unique UUID or prefixed ID
 */
export function generateId(prefix = 'id'): string {
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${Date.now()}_${randomPart}`;
}
