import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { User, Device } from '@remotedev/types';
import { generateId, generateToken } from '@remotedev/shared-utils';
import { RemoteDevError } from '@remotedev/protocol';

export class AuthService {
  constructor(private db: DatabaseSync) {}

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + '_remotedev_salt_2026').digest('hex');
  }

  public register(email: string, password: string, name?: string): { user: User; token: string } {
    const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new RemoteDevError('INVALID_PAIRING_CODE', 'A user with this email already exists');
    }

    const userId = generateId('user');
    const passwordHash = this.hashPassword(password);
    const now = Date.now();

    this.db
      .prepare('INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, email, passwordHash, name ?? 'Developer', now, now);

    const user: User = {
      id: userId,
      email,
      name: name ?? 'Developer',
      createdAt: new Date(now).toISOString(),
    };

    const token = this.generateSessionToken(userId);
    return { user, token };
  }

  public login(email: string, password: string): { user: User; token: string } {
    const passwordHash = this.hashPassword(password);
    const row: any = this.db.prepare('SELECT * FROM users WHERE email = ? AND password_hash = ?').get(email, passwordHash);

    if (!row) {
      throw new RemoteDevError('UNAUTHORIZED', 'Invalid email or password');
    }

    const user: User = {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: new Date(Number(row.created_at)).toISOString(),
    };

    const token = this.generateSessionToken(row.id);
    return { user, token };
  }

  public getUserById(userId: string): User | null {
    const row: any = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: new Date(Number(row.created_at)).toISOString(),
    };
  }

  public generateSessionToken(userId: string): string {
    const payload = `${userId}:${Date.now()}:${generateToken(16)}`;
    return Buffer.from(payload).toString('base64');
  }

  public verifyToken(token: string): string | null {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [userId] = decoded.split(':');
      if (!userId) return null;
      const user = this.getUserById(userId);
      return user ? user.id : null;
    } catch {
      return null;
    }
  }
}
