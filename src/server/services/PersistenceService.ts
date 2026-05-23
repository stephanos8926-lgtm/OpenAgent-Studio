import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";

export class PersistenceService {
  private static instance: PersistenceService;
  private saver: SqliteSaver | null = null;
  private dbPath: string;

  private constructor() {
    // Ensure the data directory exists
    const dataDir = path.join(process.cwd(), ".data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, "swarm_state.db");
  }

  public static getInstance(): PersistenceService {
    if (!PersistenceService.instance) {
      PersistenceService.instance = new PersistenceService();
    }
    return PersistenceService.instance;
  }

  /**
   * Initializes the SQLite saver. 
   * In WAL mode to handle concurrent access in container envs.
   */
  public async init() {
    try {
      if (!this.saver) {
        this.saver = SqliteSaver.fromConnString(this.dbPath);
        logger.info({ dbPath: this.dbPath }, "PersistenceService initialized with SQLite");
      } else {
        logger.info({ dbPath: this.dbPath }, "PersistenceService already initialized");
      }
    } catch (err) {
      logger.error({ err }, "Failed to initialize PersistenceService");
      throw err;
    }
  }

  public getSaver(): SqliteSaver {
    if (!this.saver) {
      try {
        this.saver = SqliteSaver.fromConnString(this.dbPath);
        logger.info({ dbPath: this.dbPath }, "PersistenceService lazily initialized with SQLite");
      } catch (err) {
        logger.error({ err }, "Failed to lazily initialize PersistenceService");
        throw err;
      }
    }
    return this.saver;
  }

  /**
   * Cleanup method to close the DB connection
   */
  public async close() {
    // SqliteSaver handles closing internally or on process exit
  }
}

export const persistenceService = PersistenceService.getInstance();
