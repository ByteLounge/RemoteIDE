"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnvelope = createEnvelope;
exports.createErrorEnvelope = createErrorEnvelope;
exports.parseProtocolMessage = parseProtocolMessage;
__exportStar(require("./errors"), exports);
__exportStar(require("./messages"), exports);
const errors_1 = require("./errors");
/**
 * Helper to construct a typed protocol envelope
 */
function createEnvelope(type, payload, options) {
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
function createErrorEnvelope(requestId, code, message, details) {
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
function parseProtocolMessage(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
            throw new errors_1.RemoteDevError('INTERNAL_ERROR', 'Invalid protocol frame structure');
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof errors_1.RemoteDevError)
            throw err;
        throw new errors_1.RemoteDevError('INTERNAL_ERROR', `Malformed JSON frame: ${err.message}`);
    }
}
