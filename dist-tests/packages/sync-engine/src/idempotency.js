"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyTracker = void 0;
/**
 * Tracks applied operation IDs to guarantee idempotent execution.
 */
class IdempotencyTracker {
    appliedOps = new Set();
    maxTracked;
    constructor(maxTracked = 10000) {
        this.maxTracked = maxTracked;
    }
    /**
     * Checks if an operation has already been applied
     */
    has(operationId) {
        return this.appliedOps.has(operationId);
    }
    /**
     * Marks an operation as applied. Enforces LRU/FIFO limit to prevent unbounded memory growth.
     */
    markApplied(operationId) {
        if (this.appliedOps.size >= this.maxTracked) {
            // Remove the oldest element
            const first = this.appliedOps.values().next().value;
            if (first) {
                this.appliedOps.delete(first);
            }
        }
        this.appliedOps.add(operationId);
    }
    clear() {
        this.appliedOps.clear();
    }
}
exports.IdempotencyTracker = IdempotencyTracker;
