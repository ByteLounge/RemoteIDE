"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const shared_utils_1 = require("@remotedev/shared-utils");
const protocol_1 = require("@remotedev/protocol");
class AuthService {
    db;
    constructor(db) {
        this.db = db;
    }
    hashPassword(password) {
        return crypto_1.default.createHash('sha256').update(password + '_remotedev_salt_2026').digest('hex');
    }
    register(email, password, name) {
        const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            throw new protocol_1.RemoteDevError('INVALID_PAIRING_CODE', 'A user with this email already exists');
        }
        const userId = (0, shared_utils_1.generateId)('user');
        const passwordHash = this.hashPassword(password);
        const now = Date.now();
        this.db
            .prepare('INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(userId, email, passwordHash, name ?? 'Developer', now, now);
        const user = {
            id: userId,
            email,
            name: name ?? 'Developer',
            createdAt: new Date(now).toISOString(),
        };
        const token = this.generateSessionToken(userId);
        return { user, token };
    }
    login(email, password) {
        const passwordHash = this.hashPassword(password);
        const row = this.db.prepare('SELECT * FROM users WHERE email = ? AND password_hash = ?').get(email, passwordHash);
        if (!row) {
            throw new protocol_1.RemoteDevError('UNAUTHORIZED', 'Invalid email or password');
        }
        const user = {
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: new Date(Number(row.created_at)).toISOString(),
        };
        const token = this.generateSessionToken(row.id);
        return { user, token };
    }
    getUserById(userId) {
        const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!row)
            return null;
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            createdAt: new Date(Number(row.created_at)).toISOString(),
        };
    }
    generateSessionToken(userId) {
        const payload = `${userId}:${Date.now()}:${(0, shared_utils_1.generateToken)(16)}`;
        return Buffer.from(payload).toString('base64');
    }
    verifyToken(token) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const [userId] = decoded.split(':');
            if (!userId)
                return null;
            const user = this.getUserById(userId);
            return user ? user.id : null;
        }
        catch {
            return null;
        }
    }
}
exports.AuthService = AuthService;
