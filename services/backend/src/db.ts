import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { createLogger } from '@remotedev/shared-utils';

const logger = createLogger('BackendDB');

export class BackendDatabase {
  private db: DatabaseSync;

  constructor(dbFilePath?: string) {
    const defaultPath = path.resolve(process.cwd(), 'data', 'remotedev.sqlite');
    const resolvedPath = dbFilePath || defaultPath;

    // Ensure data directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(resolvedPath);
    logger.info(`Database initialized at: ${resolvedPath}`);
    this.runMigrations();
  }

  private runMigrations(): void {
    const migrationPath = path.resolve(__dirname, '../../../database/migrations/001_initial_schema.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      this.db.exec(sql);
      logger.info('Applied database schema migrations successfully');
    } else {
      logger.warn(`Migration file not found at ${migrationPath}, applying inline fallback schema`);
      this.applyFallbackSchema();
    }
  }

  private applyFallbackSchema(): void {
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

  public getRawDb(): DatabaseSync {
    return this.db;
  }

  public close(): void {
    this.db.close();
  }
}
