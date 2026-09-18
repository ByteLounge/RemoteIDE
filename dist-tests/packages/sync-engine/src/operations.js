"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOperationPayload = parseOperationPayload;
exports.applyTextOperation = applyTextOperation;
const protocol_1 = require("@remotedev/protocol");
/**
 * Parses payload string safely into TextOperationPayload
 */
function parseOperationPayload(payload) {
    try {
        const parsed = JSON.parse(payload);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
        }
    }
    catch {
        // If not JSON, treat raw payload as string content for WRITE_FILE / CREATE_FILE
    }
    return { text: payload };
}
/**
 * Applies text operations (WRITE_FILE, INSERT_TEXT, DELETE_TEXT, REPLACE_TEXT)
 * to an in-memory string representation of the file.
 */
function applyTextOperation(currentContent, op) {
    const parsed = parseOperationPayload(op.payload);
    switch (op.operation_type) {
        case 'WRITE_FILE':
            return parsed.text !== undefined ? parsed.text : op.payload;
        case 'INSERT_TEXT': {
            const insertText = parsed.text ?? '';
            if (parsed.index !== undefined && parsed.index >= 0) {
                const idx = Math.min(parsed.index, currentContent.length);
                return currentContent.slice(0, idx) + insertText + currentContent.slice(idx);
            }
            if (parsed.line !== undefined && parsed.line >= 0) {
                const lines = currentContent.split('\n');
                const targetLine = Math.min(parsed.line, lines.length);
                lines.splice(targetLine, 0, insertText);
                return lines.join('\n');
            }
            // Default to appending
            return currentContent + insertText;
        }
        case 'DELETE_TEXT': {
            const start = parsed.start ?? 0;
            const length = parsed.length ?? 0;
            if (start < 0 || length <= 0)
                return currentContent;
            return currentContent.slice(0, start) + currentContent.slice(start + length);
        }
        case 'REPLACE_TEXT': {
            if (parsed.start !== undefined && parsed.length !== undefined) {
                const replacement = parsed.replacement ?? parsed.text ?? '';
                return (currentContent.slice(0, parsed.start) +
                    replacement +
                    currentContent.slice(parsed.start + parsed.length));
            }
            if (parsed.target !== undefined && parsed.replacement !== undefined) {
                return currentContent.replace(parsed.target, parsed.replacement);
            }
            return currentContent;
        }
        default:
            throw new protocol_1.RemoteDevError('COMMAND_FAILED', `Unsupported text operation type: ${op.operation_type}`);
    }
}
