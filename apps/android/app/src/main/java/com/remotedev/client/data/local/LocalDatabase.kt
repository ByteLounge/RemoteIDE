package com.remotedev.client.data.local

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.remotedev.client.data.model.FileContent
import com.remotedev.client.data.model.SyncOperation

class LocalDatabase(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "remotedev_local.db"
        private const val DATABASE_VERSION = 1

        const val TABLE_PENDING_OPS = "pending_operations"
        const val TABLE_CACHED_FILES = "cached_files"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE $TABLE_PENDING_OPS (
                operation_id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                base_version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                sequence_number INTEGER DEFAULT 0,
                status TEXT NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE $TABLE_CACHED_FILES (
                workspace_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                version INTEGER NOT NULL,
                hash TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (workspace_id, file_path)
            )
        """.trimIndent())
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_PENDING_OPS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_CACHED_FILES")
        onCreate(db)
    }

    // -------------------------------------------------------------------------
    // Pending Operations Queue
    // -------------------------------------------------------------------------

    fun insertPendingOperation(op: SyncOperation) {
        val db = writableDatabase
        val cv = ContentValues().apply {
            put("operation_id", op.operation_id)
            put("workspace_id", op.workspace_id)
            put("device_id", op.device_id)
            put("file_path", op.file_path)
            put("operation_type", op.operation_type)
            put("base_version", op.base_version)
            put("payload", op.payload)
            put("created_at", op.created_at)
            put("sequence_number", op.sequence_number)
            put("status", op.status)
        }
        db.insertWithOnConflict(TABLE_PENDING_OPS, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getPendingOperations(workspaceId: String? = null): List<SyncOperation> {
        val db = readableDatabase
        val list = mutableListOf<SyncOperation>()
        val selection = if (workspaceId != null) "workspace_id = ? AND status = 'PENDING'" else "status = 'PENDING'"
        val args = if (workspaceId != null) arrayOf(workspaceId) else null

        val cursor = db.query(TABLE_PENDING_OPS, null, selection, args, null, null, "created_at ASC")
        cursor.use { c ->
            while (c.moveToNext()) {
                list.add(
                    SyncOperation(
                        operation_id = c.getString(c.getColumnIndexOrThrow("operation_id")),
                        workspace_id = c.getString(c.getColumnIndexOrThrow("workspace_id")),
                        device_id = c.getString(c.getColumnIndexOrThrow("device_id")),
                        file_path = c.getString(c.getColumnIndexOrThrow("file_path")),
                        operation_type = c.getString(c.getColumnIndexOrThrow("operation_type")),
                        base_version = c.getLong(c.getColumnIndexOrThrow("base_version")),
                        payload = c.getString(c.getColumnIndexOrThrow("payload")),
                        created_at = c.getLong(c.getColumnIndexOrThrow("created_at")),
                        sequence_number = c.getLong(c.getColumnIndexOrThrow("sequence_number")),
                        status = c.getString(c.getColumnIndexOrThrow("status"))
                    )
                )
            }
        }
        return list
    }

    fun updateOperationStatus(operationId: String, status: String) {
        val db = writableDatabase
        val cv = ContentValues().apply { put("status", status) }
        db.update(TABLE_PENDING_OPS, cv, "operation_id = ?", arrayOf(operationId))
    }

    fun removeOperation(operationId: String) {
        val db = writableDatabase
        db.delete(TABLE_PENDING_OPS, "operation_id = ?", arrayOf(operationId))
    }

    fun getPendingCount(): Int {
        val db = readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_PENDING_OPS WHERE status = 'PENDING'", null)
        cursor.use {
            if (it.moveToFirst()) return it.getInt(0)
        }
        return 0
    }

    // -------------------------------------------------------------------------
    // Offline Cached Files
    // -------------------------------------------------------------------------

    fun cacheFile(workspaceId: String, path: String, content: String, version: Long, hash: String) {
        val db = writableDatabase
        val cv = ContentValues().apply {
            put("workspace_id", workspaceId)
            put("file_path", path)
            put("content", content)
            put("version", version)
            put("hash", hash)
            put("updated_at", System.currentTimeMillis())
        }
        db.insertWithOnConflict(TABLE_CACHED_FILES, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getCachedFile(workspaceId: String, path: String): FileContent? {
        val db = readableDatabase
        val cursor = db.query(
            TABLE_CACHED_FILES,
            null,
            "workspace_id = ? AND file_path = ?",
            arrayOf(workspaceId, path),
            null,
            null,
            null
        )
        cursor.use { c ->
            if (c.moveToFirst()) {
                return FileContent(
                    path = c.getString(c.getColumnIndexOrThrow("file_path")),
                    content = c.getString(c.getColumnIndexOrThrow("content")),
                    version = c.getLong(c.getColumnIndexOrThrow("version")),
                    hash = c.getString(c.getColumnIndexOrThrow("hash"))
                )
            }
        }
        return null
    }
}
