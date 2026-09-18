"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendDatabase = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const node_sqlite_1 = require("node:sqlite");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('BackendDB');
class BackendDatabase {
    db;
    constructor(dbFilePath) {
        const defaultPath = path_1.default.resolve(process.cwd(), 'data', 'remotedev.sqlite');
        const resolvedPath = dbFilePath || defaultPath;
        // Ensure data directory exists
        const dir = path_1.default.dirname(resolvedPath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        this.db = new node_sqlite_1.DatabaseSync(resolvedPath);
        logger.info(`Database initialized at: ${resolvedPath}`);
        this.runMigrations();
    }
    runMigrations() {
        const migrationPath = path_1.default.resolve(__dirname, '../../../database/migrations/001_initial_schema.sql');
        if (fs_1.default.existsSync(migrationPath)) {
            const sql = fs_1.default.readFileSync(migrationPath, 'utf8');
            this.db.exec(sql);
            logger.info('Applied database schema migrations successfully');
        }
        else {
            logger.warn(`Migration file not found at ${migrationPath}, applying inline fallback schema`);
            this.applyFallbackSchema();
        }
    }
    applyFallbackSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        device_type VARCHAR(64) NOT NULL,
        platform VARCHAR(64) NOT NULL,
        agent_version VARCHAR(64),
        is_online BOOLEAN DEFAULT FALSE,
        last_seen_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code VARCHAR(16) PRIMARY KEY,
        laptop_device_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        device_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_operations (
        operation_id VARCHAR(64) PRIMARY KEY,
        workspace_id VARCHAR(64) NOT NULL,
        device_id VARCHAR(64) NOT NULL,
        file_path TEXT NOT NULL,
        operation_type VARCHAR(64) NOT NULL,
        base_version BIGINT NOT NULL,
        payload TEXT NOT NULL,
        sequence_number BIGINT NOT NULL,
        status VARCHAR(32) NOT NULL,
        created_at BIGINT NOT NULL
      );
    `);
    }
    getRawDb() {
        return this.db;
    }
    close() {
        this.db.close();
    }
}
exports.BackendDatabase = BackendDatabase;
