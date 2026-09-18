# RemoteDev Synchronization Engine

## Operation Log Design

RemoteDev avoids naive whole-file overwrite synchronization. Instead, it models every modification as an immutable, idempotent atomic operation record:

```typescript
export interface SyncOperation {
  operation_id: string;          // UUID v4
  workspace_id: string;          // Target workspace
  device_id: string;             // Originating device
  file_path: string;             // Relative normalized path inside workspace
  operation_type: OperationType; // CREATE_FILE, WRITE_FILE, DELETE_FILE, etc.
  base_version: number;          // File version this operation is based on
  payload: string;               // File content or operation-specific delta
  created_at: number;            // Timestamp (milliseconds)
  sequence_number: number;       // Monotonically increasing sequence per workspace
  status: SyncStatus;            // PENDING, UPLOADING, ACKNOWLEDGED, CONFLICT, FAILED
}
```

## Operation Types

1. `CREATE_FILE`: Creates a new file at `file_path`.
2. `DELETE_FILE`: Deletes the target file.
3. `RENAME_FILE`: Renames or moves a file to the new path provided in payload.
4. `WRITE_FILE`: Full-text content update with `base_version` validation.
5. `INSERT_TEXT`: Inserts string into file at designated line/offset.
6. `DELETE_TEXT`: Deletes string at designated line/range.
7. `REPLACE_TEXT`: Replaces target slice with replacement string.

## Monotonic Sequence & Idempotency

- Every workspace maintains a monotonic counter `latest_sequence_number`.
- Operations received with an already-applied `operation_id` are instantly acknowledged as duplicates without re-applying to the filesystem.
- When an operation is accepted, the file's current version is incremented: `version = version + 1`.

## Conflict Detection (`BASE_VERSION_MISMATCH`)

1. When a change arrives from Android with `base_version = V`:
   - Laptop agent checks the actual file's current version `V_current`.
   - If `V == V_current`: Operation is applied, `V_current` becomes `V + 1`, and success is acknowledged.
   - If `V != V_current`: The operation enters the `CONFLICT` state.
2. Conflict state returns:
   - `expected_version`: `V_current`
   - `provided_version`: `V`
   - `laptop_content`: Current file content on laptop disk
   - `phone_content`: Proposed content from phone
3. Resolution options:
   - **Keep Laptop**: Discards phone operation, updates phone cache to match laptop.
   - **Keep Phone**: Overwrites laptop disk, updates `base_version` to laptop's latest + 1.
   - **Manual Merge**: Android UI presents side-by-side or combined editor to resolve differences.

## Offline Flow

```
[Phone (Offline)]
  - User edits App.tsx (v3 -> v4)
  - Creates SyncOperation (status = PENDING)
  - Writes to Android Room Database

[Phone (Network Restored)]
  - Dispatches un-synced operations to Laptop Agent or Cloud Relay
  - Laptop Agent verifies base_version:
    - OK: Applies to disk, writes new version, responds ACK
    - Mismatch: Returns BASE_VERSION_MISMATCH
  - Room DB marks operation ACKNOWLEDGED or CONFLICT
```
