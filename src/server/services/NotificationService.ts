// File: src/server/services/NotificationService.ts
import { NotificationItem, NotificationChannel, getPlatformConfig, NotificationSchema } from '../../notifications/types.js';
import { log } from '../observability/Logger.js';

export class NotificationService {
  private queue: NotificationItem[] = [];
  private schedulerBuffer: NotificationItem[] = [];
  private config = getPlatformConfig();
  private processing = false;

  constructor() {
    this.startScheduler();
  }

  public async push(rawNotif: any): Promise<void> {
    try {
      const notification = NotificationSchema.parse(rawNotif);
      
      if (notification.scheduledAt && notification.scheduledAt > Date.now()) {
        log.info('Notifications', 'Scheduling notification for future delivery', { id: notification.id, at: new Date(notification.scheduledAt).toISOString() });
        this.schedulerBuffer.push(notification);
        return;
      }

      this.enqueue(notification);
    } catch (err: any) {
      log.error('Notifications', 'Schema validation failed', { error: err.errors || err.message });
      throw err;
    }
  }

  private enqueue(notification: NotificationItem) {
    if (this.queue.length >= this.config.maxCapacity) {
      log.warn('Notifications', 'Capacity overflow - Rejecting notification', { id: notification.id, max: this.config.maxCapacity });
      return;
    }

    this.queue.push(notification);
    log.info('Notifications', 'Notification added to stack', { id: notification.id, channel: notification.channel });
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  private startScheduler() {
    setInterval(() => {
      const now = Date.now();
      const due = this.schedulerBuffer.filter(n => n.scheduledAt! <= now);
      this.schedulerBuffer = this.schedulerBuffer.filter(n => n.scheduledAt! > now);
      
      due.forEach(n => this.enqueue(n));
    }, 1000);
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const notification = this.queue[0];
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await this.deliver(notification);
        this.queue.shift(); // Remove on success
        break;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) {
          log.error('Notifications', 'Max retries exceeded for notification', { id: notification.id });
          this.queue.shift();
          break;
        }
        
        // Exponential Backoff: T = X * 2^attempt
        const waitTime = this.config.baseInterval * Math.pow(2, attempts) * 1000;
        log.warn('Notifications', `Delivery failed. Retrying in ${waitTime}ms`, { attempt: attempts, id: notification.id });
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    // Process next item after base interval gap
    setTimeout(() => this.processQueue(), this.config.baseInterval * 1000);
  }

  private async deliver(notification: NotificationItem) {
    if (notification.channel === NotificationChannel.AGENT) {
      // PROMPT ISOLATION: In a real LangGraph setup, we'd check if state !== 'busy'
      // For this implementation, we simulate delivery only when the pipeline is idle.
      log.info('Notifications', 'AGENT INJECTION - Wrapping payload in system-role envelope', { 
        id: notification.id,
        envelope: {
          role: 'SYSTEM_RUNTIME',
          immutable: true,
          type: 'PLATFORM_ALERT'
        }
      });
      // In a real app, this would be pushed to a socket or agent message queue
    }
    
    // Simulate generic delivery success
    return Promise.resolve();
  }
}

export const notificationService = new NotificationService();
