import crypto from "crypto";
import { logger } from "../utils/logger.js";

class CommandApprovalService {
  private static instance: CommandApprovalService;
  private pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();

  private constructor() {}

  public static getInstance(): CommandApprovalService {
    if (!CommandApprovalService.instance) {
      CommandApprovalService.instance = new CommandApprovalService();
    }
    return CommandApprovalService.instance;
  }

  public registerApproval(id: string, timeoutMs: number = 180000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          logger.warn(`[CommandApproval] Command approval timed out for ID: ${id}`);
          resolve(false);
          this.pendingApprovals.delete(id);
        }
      }, timeoutMs);

      this.pendingApprovals.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        }
      });
    });
  }

  public resolveApproval(id: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(id);
    if (pending) {
      logger.info(`[CommandApproval] System resolved ID ${id} with Status: ${approved ? 'APPROVED' : 'REJECTED'}`);
      pending.resolve(approved);
      this.pendingApprovals.delete(id);
      return true;
    }
    logger.warn(`[CommandApproval] No pending approval found for ID: ${id}`);
    return false;
  }
}

export const commandApprovalService = CommandApprovalService.getInstance();
