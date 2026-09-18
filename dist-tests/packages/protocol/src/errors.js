"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteDevError = void 0;
class RemoteDevError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = 'RemoteDevError';
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, RemoteDevError.prototype);
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
        };
    }
}
exports.RemoteDevError = RemoteDevError;
