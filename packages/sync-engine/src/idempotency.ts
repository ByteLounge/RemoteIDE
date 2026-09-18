/**
 * Tracks applied operation IDs to guarantee idempotent execution.
 */
export class IdempotencyTracker {
  private appliedOps: Set<string> = new Set();
  private readonly maxTracked: number;

  constructor(maxTracked = 10000) {
    this.maxTracked = maxTracked;
  }

  /**
   * Checks if an operation has already been applied
   */
  has(operationId: string): boolean {
    return this.appliedOps.has(operationId);
  }

  /**
   * Marks an operation as applied. Enforces LRU/FIFO limit to prevent unbounded memory growth.
   */
  markApplied(operationId: string): void {
    if (this.appliedOps.size >= this.maxTracked) {
      // Remove the oldest element
      const first = this.appliedOps.values().next().value;
      if (first) {
        this.appliedOps.delete(first);
      }
    }
    this.appliedOps.add(operationId);
  }

  clear(): void {
    this.appliedOps.clear();
  }
}
