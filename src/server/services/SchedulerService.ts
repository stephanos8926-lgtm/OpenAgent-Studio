import cron, { ScheduledTask as CronTask } from "node-cron";
import { logger } from "../utils/logger.js";
import { PlatformAgent } from "../agents/PlatformAgent.js";
import { getConfig } from "../config/index.js";

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  lastRun?: Date;
  status: "active" | "inactive";
}

class SchedulerService {
  private tasks: Map<string, CronTask> = new Map();
  private taskMetadata: ScheduledTask[] = [];

  constructor() {}

  /**
   * Initializes default system tasks, such as periodic health checks.
   */
  public async init() {
    const config = getConfig();
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (openRouterKey) {
      // Platform Maintenance Loop: Every 30 minutes
      this.registerJob(
        "platform-maintenance",
        "*/30 * * * *",
        async () => {
          logger.info("[Scheduler] Starting Platform Maintenance Loop...");
          const platformAgent = new PlatformAgent(openRouterKey);
          // In a real scenario, we'd pass the current global system state
          const health = await platformAgent.runHealthCheck({ 
            systemTime: new Date().toISOString(),
            context: "scheduled-maintenance" 
          });
          
          if (health.repair_needed) {
            logger.warn(`[Scheduler] Platform Repair Needed: ${health.actions.join(", ")}`);
            // Here we could trigger actual repair logic
          }
        },
        "Platform Architect Maintenance"
      );
    }

    logger.info("[Scheduler] SchedulerService initialized.");
  }

  public registerJob(id: string, expression: string, task: () => void | Promise<void>, name: string) {
    if (this.tasks.has(id)) {
      this.tasks.get(id)?.stop();
    }

    const job = cron.schedule(expression, async () => {
      try {
        await task();
        const meta = this.taskMetadata.find(t => t.id === id);
        if (meta) meta.lastRun = new Date();
      } catch (err: any) {
        logger.error({ err }, `[Scheduler] Job ${id} failed`);
      }
    });

    this.tasks.set(id, job);
    this.taskMetadata = this.taskMetadata.filter(t => t.id !== id);
    this.taskMetadata.push({
      id,
      name,
      cronExpression: expression,
      status: "active"
    });

    logger.info(`[Scheduler] Registered job ${id}: ${expression}`);
  }

  public stopJob(id: string) {
    const job = this.tasks.get(id);
    if (job) {
      job.stop();
      this.tasks.delete(id);
      const meta = this.taskMetadata.find(t => t.id === id);
      if (meta) meta.status = "inactive";
    }
  }

  public getTasks() {
    return this.taskMetadata;
  }
}

export const scheduler = new SchedulerService();
