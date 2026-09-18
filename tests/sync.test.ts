import {
  applyTextOperation,
  checkVersionConflict,
  resolveConflict,
  IdempotencyTracker,
} from '../packages/sync-engine/src';
import { SyncOperation, ConflictResolution } from '../packages/types/src';

export function runSyncTests(): boolean {
  console.log('\n=== [SUITE] Sync Engine Tests ===');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  };

  // 1. Text operations
  const initialText = 'function hello() {\n  return "world";\n}\n';

  // WRITE_FILE
  const writeOp: SyncOperation = {
    operation_id: 'op_write_1',
    workspace_id: 'ws_1',
    device_id: 'dev_1',
    file_path: 'src/hello.ts',
    operation_type: 'WRITE_FILE',
    base_version: 1,
    payload: 'console.log("rewritten");',
    created_at: Date.now(),
    sequence_number: 1,
    status: 'PENDING',
  };
  const writeResult = applyTextOperation(initialText, writeOp);
  assert(writeResult === 'console.log("rewritten");', 'WRITE_FILE replaces complete content');

  // INSERT_TEXT (index based)
  const insertOp: SyncOperation = {
    operation_id: 'op_insert_1',
    workspace_id: 'ws_1',
    device_id: 'dev_1',
    file_path: 'src/hello.ts',
    operation_type: 'INSERT_TEXT',
    base_version: 1,
    payload: JSON.stringify({ index: 0, text: '// Header\n' }),
    created_at: Date.now(),
    sequence_number: 2,
    status: 'PENDING',
  };
  const insertResult = applyTextOperation('const a = 1;', insertOp);
  assert(insertResult === '// Header\nconst a = 1;', 'INSERT_TEXT prepends text at index 0');

  // REPLACE_TEXT
  const replaceOp: SyncOperation = {
    operation_id: 'op_replace_1',
    workspace_id: 'ws_1',
    device_id: 'dev_1',
    file_path: 'src/hello.ts',
    operation_type: 'REPLACE_TEXT',
    base_version: 1,
    payload: JSON.stringify({ target: 'foo', replacement: 'bar' }),
    created_at: Date.now(),
    sequence_number: 3,
    status: 'PENDING',
  };
  const replaceResult = applyTextOperation('const foo = 123;', replaceOp);
  assert(replaceResult === 'const bar = 123;', 'REPLACE_TEXT replaces target pattern');

  // 2. Conflict Detection
  const validOp: SyncOperation = {
    ...writeOp,
    operation_id: 'op_valid_1',
    base_version: 5,
  };
  const noConflict = checkVersionConflict(validOp, 5, 'content');
  assert(noConflict === null, 'No conflict when base_version matches disk version');

  const staleOp: SyncOperation = {
    ...writeOp,
    operation_id: 'op_stale_1',
    base_version: 4,
  };
  const conflict = checkVersionConflict(staleOp, 5, 'disk content v5');
  assert(conflict !== null, 'Conflict detected when base_version is stale');
  assert(conflict?.expected_version === 5, 'Conflict expected_version is current disk version');
  assert(conflict?.actual_version === 4, 'Conflict actual_version is stale operation version');

  // 3. Conflict Resolution
  if (conflict) {
    const keepLaptopRes = resolveConflict(conflict, {
      conflict_id: conflict.conflict_id,
      choice: 'KEEP_LAPTOP',
    });
    assert(keepLaptopRes.finalContent === 'disk content v5', 'KEEP_LAPTOP preserves disk content');

    const keepPhoneRes = resolveConflict(conflict, {
      conflict_id: conflict.conflict_id,
      choice: 'KEEP_PHONE',
    });
    assert(keepPhoneRes.finalContent === staleOp.payload, 'KEEP_PHONE applies phone version');
    assert(keepPhoneRes.newVersion === 6, 'KEEP_PHONE increments version');

    const manualRes = resolveConflict(conflict, {
      conflict_id: conflict.conflict_id,
      choice: 'MANUAL_MERGE',
      merged_content: 'manually resolved content',
    });
    assert(manualRes.finalContent === 'manually resolved content', 'MANUAL_MERGE writes user merged content');
  }

  // 4. Idempotency Tracking
  const tracker = new IdempotencyTracker();
  assert(!tracker.has('op_100'), 'Tracker initially does not have operation');
  tracker.markApplied('op_100');
  assert(tracker.has('op_100'), 'Tracker marks operation as applied');
  assert(tracker.has('op_100'), 'Subsequent check recognizes duplicate operation');

  console.log(`Sync Tests Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}
