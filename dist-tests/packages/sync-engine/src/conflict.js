"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkVersionConflict = checkVersionConflict;
exports.resolveConflict = resolveConflict;
const shared_utils_1 = require("@remotedev/shared-utils");
const operations_1 = require("./operations");
/**
 * Checks whether an incoming operation conflicts with the current file state
 */
function checkVersionConflict(op, currentVersion, currentDiskContent) {
    // If base_version matches currentVersion, no conflict
    if (op.base_version === currentVersion) {
        return null;
    }
    // Otherwise, conflict detected!
    let phoneContent;
    try {
        if (op.operation_type === 'WRITE_FILE') {
            phoneContent = op.payload;
        }
        else {
            // Simulate applying the operation to see what the phone intended
            phoneContent = (0, operations_1.applyTextOperation)(currentDiskContent, op);
        }
    }
    catch {
        phoneContent = op.payload;
    }
    return {
        conflict_id: (0, shared_utils_1.generateId)('conf'),
        operation_id: op.operation_id,
        workspace_id: op.workspace_id,
        file_path: op.file_path,
        expected_version: currentVersion,
        actual_version: op.base_version,
        laptop_content: currentDiskContent,
        phone_content: phoneContent,
        detected_at: Date.now(),
    };
}
/**
 * Resolves a conflict according to user choice: KEEP_LAPTOP, KEEP_PHONE, MANUAL_MERGE
 */
function resolveConflict(conflict, resolution) {
    switch (resolution.choice) {
        case 'KEEP_LAPTOP':
            return {
                finalContent: conflict.laptop_content,
                newVersion: conflict.expected_version,
            };
        case 'KEEP_PHONE':
            return {
                finalContent: conflict.phone_content,
                newVersion: conflict.expected_version + 1,
            };
        case 'MANUAL_MERGE':
            return {
                finalContent: resolution.merged_content ?? conflict.phone_content,
                newVersion: conflict.expected_version + 1,
            };
        default:
            return {
                finalContent: conflict.laptop_content,
                newVersion: conflict.expected_version,
            };
    }
}
