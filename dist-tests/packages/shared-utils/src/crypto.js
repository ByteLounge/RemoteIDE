"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePairingCode = generatePairingCode;
exports.generateToken = generateToken;
exports.hashContent = hashContent;
exports.generateId = generateId;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generates an ephemeral 6-digit pairing code (e.g. "742 193")
 */
function generatePairingCode() {
    const num = crypto_1.default.randomInt(100000, 999999).toString();
    const formatted = `${num.slice(0, 3)} ${num.slice(3, 6)}`;
    return { formatted, raw: num };
}
/**
 * Generates a high-entropy random token
 */
function generateToken(byteLength = 32) {
    return crypto_1.default.randomBytes(byteLength).toString('hex');
}
/**
 * Computes SHA-256 hash of a string or buffer
 */
function hashContent(content) {
    return crypto_1.default.createHash('sha256').update(content).digest('hex');
}
/**
 * Generates a unique UUID or prefixed ID
 */
function generateId(prefix = 'id') {
    const randomPart = crypto_1.default.randomBytes(8).toString('hex');
    return `${prefix}_${Date.now()}_${randomPart}`;
}
