// File: src/notifications/types.ts
import { z } from 'zod';

export enum NotificationChannel {
  TOAST = 'TOAST',
  WEB = 'WEB',
  AGENT = 'AGENT'
}

const generateId = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + '-' + Math.random().toString(36).substring(2, 9);
};

export const NotificationSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().max(24, "Identifier bound exceeded (max 24 chars)"),
  channel: z.nativeEnum(NotificationChannel),
  message: z.string(),
  scheduledAt: z.number().optional(), // Unix timestamp ms
  metadata: z.record(z.string(), z.any()).optional()
}).refine((data) => {
  const max = data.channel === NotificationChannel.TOAST ? 256 : 512;
  return data.message.length <= max;
}, {
  message: "Payload capacity filter violation"
});

export type NotificationItem = z.infer<typeof NotificationSchema>;

export const DEFAULT_CONFIG = {
  X_INTERVAL: 3, // Seconds
  MAX_CAPACITY: 5
};

export function getPlatformConfig() {
  return {
    baseInterval: Number(process.env.VITE_NOTIF_INTERVAL || process.env.NOTIF_INTERVAL || DEFAULT_CONFIG.X_INTERVAL),
    maxCapacity: Number(process.env.VITE_NOTIF_MAX_CAPACITY || process.env.NOTIF_MAX_CAPACITY || DEFAULT_CONFIG.MAX_CAPACITY)
  };
}
