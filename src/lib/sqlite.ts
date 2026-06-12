// File: src/lib/sqlite.ts

import initSqlJs from 'sql.js';
import { getSQLiteBackup, saveSQLiteBackup } from './db';
import { WorkspaceFile } from '../types';

let dbInstance: any = null;
let SQLModule: any = null;

export interface FlatFileRow {
  path: string;
  name: string;
  is_directory: number;
  content?: string;
  proposed_content?: string;
}

export interface SystemConfig {
  yoloMode: boolean;
  openRouterKey: string;
  modelName: string;
  apiProvider: 'google' | 'openrouter';
}

// 1. Evolutionary Schema migrations array
const MIGRATIONS = [
  {
    version: 1,
    up: (db: any) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS workspace_files (
          path TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_directory INTEGER NOT NULL,
          content TEXT,
          proposed_content TEXT
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS system_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
  },
  {
    version: 2,
    up: (db: any) => {
      // Evolutionary schema change to confirm backward compatibility across revisions
      try {
        db.run("ALTER TABLE workspace_files ADD COLUMN updated_at TEXT;");
      } catch (err) {
        console.warn("Migration 2 warning (maybe column already exists):", err);
      }
    }
  },
  {
    version: 3,
    up: (db: any) => {
      try {
        db.run(`
          CREATE TABLE IF NOT EXISTS lessons_learned (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            error_pattern TEXT NOT NULL,
            discovered_constraint TEXT NOT NULL,
            remedial_action TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);

        // Insert initial placeholder lessons representing actual resolved compiler and VFS constraints
        const initialLessons = [
          ['l-1', 'Compiler', 'wasm streaming compile failed', 'CDN paths must match SQL.js structure', 'Always define locateFile to pull verified wasm modules from official jsdelivr pathways.', new Date().toISOString()],
          ['l-2', 'VFS & Edits', 'Target content not found', 'edit_file requires precise substring matching', 'Query exact contiguous sections before executing structural replacements to prevent spacing/typographic mismatches.', new Date().toISOString()],
          ['l-3', 'React & State', 'infinite re-renders in useEffect', 'Dependencies must be primitives or fully memoized', 'Never update state directly in render scope; restrict dependency arrays to primitives or use memoized callback hooks.', new Date().toISOString()]
        ];

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO lessons_learned (id, category, error_pattern, discovered_constraint, remedial_action, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const val of initialLessons) {
          stmt.run(val);
        }
        stmt.free();
      } catch (err) {
        console.error("Migration 3 failed:", err);
      }
    }
  }
];

/**
 * Runs pending schema migrations on the SQLite database instance
 */
export function runMigrations(db: any) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Query applied migrations
  const stmt = db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC");
  const applied: number[] = [];
  while (stmt.step()) {
    applied.push(stmt.getAsObject().version as number);
  }
  stmt.free();

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      console.log(`Applying SQLite migration version ${migration.version}...`);
      migration.up(db);
      db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
        migration.version,
        new Date().toISOString()
      ]);
    }
  }
}

/**
 * Exports SQLite database memory bytes and backs them up into IndexedDB
 */
export async function persistDb() {
  if (dbInstance) {
    const binary = dbInstance.export();
    await saveSQLiteBackup(binary);
    console.log("SQL.js Database binary persisted to IndexedDB cache store.");
  }
}

/**
 * Lazily boots SQL.js module, restores database binary from IndexedDB, and runs schema migrations
 */
export async function getDbInstance() {
  if (dbInstance) return dbInstance;

  // Initialize WebAssembly environment via secure CDN
  const SQL = await initSqlJs({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
  });
  SQLModule = SQL;

  // Load binary backup from IndexedDB
  const backupBinary = await getSQLiteBackup();
  if (backupBinary) {
    try {
      dbInstance = new SQL.Database(backupBinary);
      console.log("SQL.js initialized with existing backup from IndexedDB storage.");
    } catch (err) {
      console.error("Failed to load existing SQLite database backup, booting new SQLite instance.", err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
    console.log("SQL.js initialized as a brand new database.");
  }

  // Run evolutionary migrations
  runMigrations(dbInstance);
  await persistDb(); // Save initial schema setup

  return dbInstance;
}

/**
 * Flattens nested workspace folders and files into database table row formats
 */
export function flattenFiles(nodes: WorkspaceFile[]): FlatFileRow[] {
  const result: FlatFileRow[] = [];
  const traverse = (node: WorkspaceFile) => {
    result.push({
      path: node.path,
      name: node.name,
      is_directory: node.isDirectory ? 1 : 0,
      content: node.content,
      proposed_content: node.proposedContent
    });
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  nodes.forEach(traverse);
  return result;
}

/**
 * Reconstructs nested structure of WorkspaceFile items from flat DB rows
 */
export function unflattenFiles(rows: FlatFileRow[]): WorkspaceFile[] {
  const sorted = [...rows].sort((a, b) => a.path.length - b.path.length);
  const fileMap = new Map<string, WorkspaceFile>();
  const rootFiles: WorkspaceFile[] = [];

  for (const row of sorted) {
    const fileNode: WorkspaceFile = {
      name: row.name,
      path: row.path,
      isDirectory: row.is_directory === 1,
      content: row.content,
      proposedContent: row.proposed_content
    };
    if (fileNode.isDirectory) {
      fileNode.children = [];
    }

    fileMap.set(row.path, fileNode);

    const parts = row.path.split('/');
    if (parts.length === 1) {
      rootFiles.push(fileNode);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = fileMap.get(parentPath);
      if (parent && parent.children) {
        parent.children.push(fileNode);
      } else {
        rootFiles.push(fileNode);
      }
    }
  }

  return rootFiles;
}

/**
 * Saves virtual workspace files to SQLite
 */
export async function saveWorkspaceFilesToSQLite(files: WorkspaceFile[]): Promise<void> {
  const db = await getDbInstance();
  const flatRows = flattenFiles(files);

  db.run("DELETE FROM workspace_files");

  const stmt = db.prepare(`
    INSERT INTO workspace_files (path, name, is_directory, content, proposed_content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const row of flatRows) {
    stmt.run([
      row.path,
      row.name,
      row.is_directory,
      row.content ?? null,
      row.proposed_content ?? null,
      new Date().toISOString()
    ]);
  }
  stmt.free();

  await persistDb();
}

/**
 * Loads and reconstructs virtual workspace files from SQLite
 */
export async function loadWorkspaceFilesFromSQLite(): Promise<WorkspaceFile[] | null> {
  const db = await getDbInstance();
  const stmt = db.prepare("SELECT path, name, is_directory, content, proposed_content FROM workspace_files");
  const rows: FlatFileRow[] = [];

  while (stmt.step()) {
    const obj = stmt.getAsObject() as any;
    rows.push({
      path: obj.path,
      name: obj.name,
      is_directory: obj.is_directory,
      content: obj.content === null ? undefined : obj.content,
      proposed_content: obj.proposed_content === null ? undefined : obj.proposed_content
    });
  }
  stmt.free();

  if (rows.length === 0) return null;
  return unflattenFiles(rows);
}

/**
 * Saves system connection settings config to SQLite
 */
export async function saveSystemConfigToSQLite(config: Partial<SystemConfig>): Promise<void> {
  const db = await getDbInstance();
  const stmt = db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)");

  if (config.yoloMode !== undefined) stmt.run(['yoloMode', config.yoloMode ? '1' : '0']);
  if (config.openRouterKey !== undefined) stmt.run(['openRouterKey', config.openRouterKey]);
  if (config.modelName !== undefined) stmt.run(['modelName', config.modelName]);
  if (config.apiProvider !== undefined) stmt.run(['apiProvider', config.apiProvider]);

  stmt.free();
  await persistDb();
}

/**
 * Loads system connection settings config from SQLite
 */
export async function loadSystemConfigFromSQLite(): Promise<Partial<SystemConfig> | null> {
  const db = await getDbInstance();
  const stmt = db.prepare("SELECT key, value FROM system_config");
  const config: Partial<SystemConfig> = {};
  let hasData = false;

  while (stmt.step()) {
    hasData = true;
    const obj = stmt.getAsObject() as { key: string; value: string };
    if (obj.key === 'yoloMode') config.yoloMode = obj.value === '1';
    if (obj.key === 'openRouterKey') config.openRouterKey = obj.value;
    if (obj.key === 'modelName') config.modelName = obj.value;
    if (obj.key === 'apiProvider') config.apiProvider = obj.value as 'google' | 'openrouter';
  }
  stmt.free();

  return hasData ? config : null;
}

/**
 * Loads all lessons learned from SQLite
 */
export async function loadLessonsFromSQLite(): Promise<any[]> {
  const db = await getDbInstance();
  const stmt = db.prepare("SELECT id, category, error_pattern, discovered_constraint, remedial_action, created_at FROM lessons_learned ORDER BY created_at DESC");
  const rows: any[] = [];

  while (stmt.step()) {
    const obj = stmt.getAsObject() as any;
    rows.push({
      id: obj.id,
      category: obj.category,
      errorPattern: obj.error_pattern,
      discoveredConstraint: obj.discovered_constraint,
      remedialAction: obj.remedial_action,
      createdAt: obj.created_at
    });
  }
  stmt.free();
  return rows;
}

/**
 * Saves or updates a lesson learned in SQLite
 */
export async function saveLessonToSQLite(lesson: { id: string; category: string; errorPattern: string; discoveredConstraint: string; remedialAction: string; createdAt: string }): Promise<void> {
  const db = await getDbInstance();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lessons_learned (id, category, error_pattern, discovered_constraint, remedial_action, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    lesson.id,
    lesson.category,
    lesson.errorPattern,
    lesson.discoveredConstraint,
    lesson.remedialAction,
    lesson.createdAt
  ]);
  stmt.free();
  await persistDb();
}

/**
 * Deletes a lesson learned from SQLite
 */
export async function deleteLessonFromSQLite(id: string): Promise<void> {
  const db = await getDbInstance();
  const stmt = db.prepare("DELETE FROM lessons_learned WHERE id = ?");
  stmt.run([id]);
  stmt.free();
  await persistDb();
}

